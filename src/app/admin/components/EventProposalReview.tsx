import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import {
  ArrowLeft, Download, Clock, CheckCircle, CheckCircle2, XCircle, RotateCcw,
  Calendar, Users, Shield, Receipt, FileText, FileCheck, History,
  ChevronRight, Eye, Send, Gavel, Check, X, AlertTriangle, AlertCircle, Rocket,
  FileImage, Coins, FolderArchive, Trash2, FileSignature, Lock, Unlock,
  Target, Wrench, Megaphone, ListChecks, TrendingUp, UserCheck, Smartphone, QrCode, DollarSign, SlidersHorizontal,
  PenTool, ShieldCheck, Undo2, GitCompare, ChevronDown, Upload, Building2
} from 'lucide-react';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '../../../services/firebase';
import type { EventDocument } from '../../modules/events/types/event.types';
import type { FinancialLineItem, ProposalApprovalStep } from '../../modules/activity-proposals/types/proposal.types';
import { approveEvent, rejectEvent, returnEvent, updateAdviserRemarks, withdrawProposal } from '../../modules/events/services/event.service';
import WithdrawConfirmModal from '../../modules/workflow/components/WithdrawConfirmModal';
import { getProposalById, endorseProposal } from '../../modules/activity-proposals/services/proposal.service';
import RevisionDiffViewerModal from '../../modules/workflow/components/RevisionDiffViewerModal';
import InlineRevisionBadge from '../../modules/workflow/components/InlineRevisionBadge';
import { diffActivityProposal } from '../../modules/workflow/utils/document-diff-engine';
import { normalizeApprovalStages } from '../../modules/workflow/utils/stage-normalization.utils';
import {
  resolveCleanOrgName,
  resolveCleanOrgAcronym,
  isSasCreatedEvent,
  stripSasPhrases,
  isEventLiquidationExempt,
} from '../../modules/events/utils/organization-display.utils';
import {
  getSasSignatoryConfig,
  getCachedSasSignatoryConfig,
  subscribeToSasSignatoryConfig,
  saveSasSignatoryConfig,
  type SasSignatoryConfig,
} from '../../modules/signatories/services/sas-signatory.service';
import {
  CancelEventModal,
  canCancelEvent,
  ConcludeEventModal,
  ArchiveEventModal,
  DeleteArchivedEventModal,
  getEventTimingStatus,
  isProposalFullySigned,
  PublishStudentFeedModal,
  AttendanceScannersModal,
} from '../../modules/events';
import OfficerLiquidationModal from '../../officer/components/OfficerLiquidationModal';
import DisbursementVoucherModal from '../../modules/finance/components/DisbursementVoucherModal';
import { useAdviserProfile } from '../../modules/auth/hooks/useAdviserProfile';
import stiOrmocLogo from '../../../imports/STI_ORMOC_LOGO.jpg';
import { useOrganizationStream } from '../../modules/organizations/hooks/useOrganizationStream';
import { useEventTypesStream, useVenuesStream } from '../../modules/events/hooks/useEventConfigStream';
import { useDepartments, useCourses, useSections } from '../../modules/academic/hooks/useAcademicStream';
import ActivitySignatoryTracker from '../../modules/activity-proposals/components/workflow/ActivitySignatoryTracker';
import { exportActivityProposalPDF } from '../../modules/activity-proposals/utils/proposal-pdf-exporter';
import { formatPHP } from '../../modules/activity-proposals/utils/proposal-calculations';
import { formatAppDate, formatAppDateTime, format12HourTime } from '../../utils/date';

interface EventProposalReviewProps {
  event: EventDocument;
  onClose: () => void;
}

type Decision = 'none' | 'approved' | 'returned' | 'rejected';
type ActiveModal = 'none' | 'approve' | 'return' | 'reject';

const NAV_SECTIONS = [
  { id: 'overview', icon: FileText, label: '1. Activity Overview' },
  { id: 'objectives', icon: Target, label: '2. Objectives & Indicators' },
  { id: 'operations', icon: SlidersHorizontal, label: '3. Operations & Budget Custodians' },
  { id: 'execution', icon: Wrench, label: '4. Mechanics & Materials' },
  { id: 'audience_schedule', icon: Calendar, label: '5. Schedule & Target Audience' },
  { id: 'strategy', icon: Megaphone, label: '6. Marketing & Documentation' },
  { id: 'tasks', icon: ListChecks, label: '7. Committee Task Matrix' },
  { id: 'financials', icon: Receipt, label: '8. Financial Projections' },
  { id: 'signatories', icon: FileSignature, label: '9. Signatories & Approvals' },
  { id: 'history', icon: History, label: '10. Remarks & History' },
];

export interface ReturnStepFlag {
  stepNumber: number;
  flag: string;
  label: string;
  description: string;
}

export const RETURN_FLAGS_GROUPED: ReturnStepFlag[] = [
  { stepNumber: 1, flag: 'Step 1: Activity Identity, Theme, or Proponents', label: 'Step 1: General Info & Proponents', description: 'Activity Title, Rationale, Theme, Proponents, and Organizing Body' },
  { stepNumber: 2, flag: 'Step 2: Institutional Objectives or Success Indicators', label: 'Step 2: Objectives & Mechanics', description: 'Institutional Objectives, Measurable Indicators, Mechanics, and Materials' },
  { stepNumber: 3, flag: 'Step 3: Target Audience Scope, Sessions or Schedule', label: 'Step 3: Target Audience & Market', description: 'Target Demographics, Academic Level, and Estimated Attendance' },
  { stepNumber: 4, flag: 'Step 4: Target Audience Scope, Sessions or Schedule', label: 'Step 4: Date, Venue & Schedule', description: 'Event Dates, Campus Venues, and Multi-Session Scanning Windows' },
  { stepNumber: 5, flag: 'Step 5: Committee Task Allocations or Dates', label: 'Step 5: Committee Task Matrix', description: 'Committee Milestones, Assigned Persons, and Target Deadlines' },
  { stepNumber: 6, flag: 'Step 6: Financial Projections (Revenues, Expenses, or Balance)', label: 'Step 6: Financial Projections', description: 'Projected Revenues, Line-Item Expenses, Fund Sources, and Balanced Budget' },
  { stepNumber: 7, flag: 'Step 7: Signatories, Urgent Justification & Vetting', label: 'Step 7: Signatories & Vetting', description: 'Signatory Routing Sequence, Endorsements, and Urgent Justification' },
];

const REJECTION_REASONS = [
  'Fraudulent or Misleading Information',
  'Insufficient Documentation or Incomplete Form AP-01',
  'Financial Budget Exceeds Allocation Limit',
  'Scheduling or Venue Conflict',
  'Institutional Policy Violation',
  'Activity Not Aligned with Institutional Goals',
  'Duplicate Activity Proposal',
  'Other',
];

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-3 mb-1">
        <div className="w-1.5 h-6 bg-[#001A4D] rounded-full" />
        <h3 className="text-[#001A4D] font-bold text-lg">{title}</h3>
      </div>
      <p className="text-gray-500 text-xs ml-4.5">{subtitle}</p>
      <div className="mt-3 border-b border-gray-200" />
    </div>
  );
}

export default function EventProposalReview({ event, onClose }: EventProposalReviewProps) {
  const navigate = useNavigate();
  const { profile: adviserProfile } = useAdviserProfile();
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  const handleWithdraw = async () => {
    setIsWithdrawing(true);
    try {
      await withdrawProposal(
        event.id,
        adviserProfile?.uid || 'admin-user',
        adviserProfile?.displayName || 'SAO Admin'
      );
      toast.success('Proposal Withdrawn', {
        description: `"${event.title}" has been returned to Draft status.`,
      });
      setShowWithdrawModal(false);
      onClose();
    } catch (err: any) {
      toast.error('Failed to withdraw proposal', {
        description: err.message || 'Please try again.',
      });
    } finally {
      setIsWithdrawing(false);
    }
  };

  const [activeSection, setActiveSection] = useState('overview');
  const [visitedSections, setVisitedSections] = useState<Set<string>>(new Set(['overview']));
  const [remarks, setRemarks] = useState(event.adviserRemarks || '');
  const [remarksError, setRemarksError] = useState(false);
  const [activeModal, setActiveModal] = useState<ActiveModal>('none');
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showDiffModal, setShowDiffModal] = useState(false);

  // Return modal state & granular per-step remarks
  const [returnFlags, setReturnFlags] = useState<string[]>(event.returnFlags || []);
  const [returnDeadline, setReturnDeadline] = useState(event.returnDeadline || '');
  const [stepRemarks, setStepRemarks] = useState<Record<string, string>>(() => {
    return (event as any).stepRevisionRemarks || {};
  });

  // Reject modal state
  const [rejectionReason, setRejectionReason] = useState(event.rejectionReason || '');

  // Live Event state synchronized with real-time Firestore updates
  const [liveEvent, setLiveEvent] = useState<EventDocument>(event);

  useEffect(() => {
    setLiveEvent(event);
  }, [event]);

  // SAS Signatory Configuration & Real-time Subscription
  const [sasConfig, setSasConfig] = useState<SasSignatoryConfig>(() => getCachedSasSignatoryConfig());
  useEffect(() => {
    const unsub = subscribeToSasSignatoryConfig((cfg) => {
      setSasConfig(cfg);
    });
    return () => unsub();
  }, []);

  // Modal Signature Pad state (when signing/endorsing in modal)
  const [modalSignatureDataUrl, setModalSignatureDataUrl] = useState<string | null>(null);
  const [isDrawingModalSig, setIsDrawingModalSig] = useState(false);
  const modalCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isModalDrawing, setIsModalDrawing] = useState(false);
  const [modalHasDrawn, setModalHasDrawn] = useState(false);

  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = modalCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const startModalDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = modalCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { x, y } = getCanvasCoords(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#000000';
    setIsModalDrawing(true);
    setModalHasDrawn(true);
  };

  const drawModalMove = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isModalDrawing) return;
    const canvas = modalCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { x, y } = getCanvasCoords(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopModalDrawing = () => {
    if (!isModalDrawing) return;
    setIsModalDrawing(false);
    const canvas = modalCanvasRef.current;
    if (canvas) {
      setModalSignatureDataUrl(canvas.toDataURL('image/png'));
    }
  };

  const clearModalCanvas = () => {
    const canvas = modalCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setModalHasDrawn(false);
    setModalSignatureDataUrl(null);
  };

  // Full Activity Proposal hydration (merging full Form AP-01 details)
  const [fullProposal, setFullProposal] = useState<any>(event);

  useEffect(() => {
    let isMounted = true;
    if (event?.id) {
      getProposalById(event.id)
        .then((p) => {
          if (isMounted && p) {
            setFullProposal((prev: any) => ({ ...prev, ...p }));
          }
        })
        .catch(console.error);
    }
    return () => {
      isMounted = false;
    };
  }, [event?.id]);

  // Real-time Firestore document listener across both activities and events collections
  useEffect(() => {
    if (!event?.id) return;
    let actData: any = null;
    let evtData: any = null;

    const syncLive = () => {
      const merged: any = { ...(event || {}), ...(evtData || {}), ...(actData || {}) };
      const chain: any[] = actData?.approvalChain || evtData?.approvalChain || (event as any)?.approvalChain || [];
      const hasChain = Array.isArray(chain) && chain.length > 0;
      const fullySigned = isProposalFullySigned(chain);

      // Check if chain is fully signed or document is approved in Firestore
      const isApprovedInFirestore =
        (hasChain && fullySigned) ||
        actData?.proposalStatus === 'approved' ||
        actData?.status === 'approved' ||
        actData?.status === 'approved_president' ||
        actData?.isApproved === true ||
        evtData?.proposalStatus === 'approved' ||
        evtData?.status === 'approved' ||
        evtData?.isApproved === true;

      // Explicit returned marker (only applies if document is NOT already approved)
      const isExplicitReturned =
        !isApprovedInFirestore && (
          merged.proposalStatus === 'returned' ||
          merged.status === 'returned' ||
          merged.lifecycleStatus === 'returned' ||
          Boolean(merged.isReturned) ||
          Boolean(actData?.isReturned) ||
          Boolean(evtData?.isReturned) ||
          actData?.proposalStatus === 'returned' ||
          evtData?.proposalStatus === 'returned'
        );

      // Explicit pending/review markers prevent forced approval unless fully signed
      const isExplicitPending =
        merged.proposalStatus === 'pending' ||
        merged.proposalStatus === 'pending_review' ||
        merged.proposalStatus === 'under_review' ||
        merged.status === 'under_review' ||
        merged.status === 'pending' ||
        merged.lifecycleStatus === 'pending_review';

      if (isApprovedInFirestore) {
        merged.proposalStatus = 'approved';
        if (merged.status !== 'completed' && merged.status !== 'cancelled') {
          merged.status = 'approved';
        }
        if (merged.lifecycleStatus !== 'completed' && merged.lifecycleStatus !== 'cancelled') {
          merged.lifecycleStatus = 'approved';
        }
        merged.isApproved = true;
        merged.isReturned = false;
        merged.adviserRemarks = null;
        merged.stepRevisionRemarks = null;
        merged.returnFlags = [];
        merged.approvedAt = actData?.approvedAt || evtData?.approvedAt || (event as any)?.approvedAt || merged.approvedAt || new Date();
        merged.approvedBy = actData?.approvedBy || evtData?.approvedBy || (event as any)?.approvedBy || merged.approvedBy;
      } else if (isExplicitReturned) {
        merged.proposalStatus = 'returned';
        if (merged.status !== 'completed' && merged.status !== 'cancelled') {
          merged.status = 'returned';
        }
        if (merged.lifecycleStatus !== 'completed' && merged.lifecycleStatus !== 'cancelled') {
          merged.lifecycleStatus = 'returned';
        }
        merged.isReturned = true;
        delete merged.approvedAt;
        delete merged.approvedBy;
      } else if (hasChain) {
        if (fullySigned) {
          merged.proposalStatus = 'approved';
          if (merged.status !== 'completed' && merged.status !== 'cancelled') {
            merged.status = 'approved';
          }
          if (merged.lifecycleStatus !== 'completed' && merged.lifecycleStatus !== 'cancelled') {
            merged.lifecycleStatus = 'approved';
          }
          merged.isApproved = true;
          merged.isReturned = false;
          merged.approvedAt = actData?.approvedAt || evtData?.approvedAt || (event as any)?.approvedAt || merged.approvedAt;
          merged.approvedBy = actData?.approvedBy || evtData?.approvedBy || (event as any)?.approvedBy || merged.approvedBy;
        } else if (isExplicitPending) {
          merged.proposalStatus = 'pending';
          if (merged.status !== 'completed' && merged.status !== 'cancelled') {
            merged.status = 'pending';
          }
          if (merged.lifecycleStatus !== 'completed' && merged.lifecycleStatus !== 'cancelled') {
            merged.lifecycleStatus = 'pending_review';
          }
        }
      } else {
        const isPropApproved = (event as any)?.proposalStatus === 'approved' || (event as any)?.status === 'approved' || Boolean((event as any)?.approvedAt) || (event as any)?.isApproved === true;
        const isEvtApproved = evtData?.proposalStatus === 'approved' || evtData?.status === 'approved' || Boolean(evtData?.approvedAt) || evtData?.isApproved === true;
        const isActApproved = actData?.proposalStatus === 'approved' || actData?.status === 'approved' || Boolean(actData?.approvedAt) || actData?.isApproved === true;
        if (!isExplicitPending && (isPropApproved || isEvtApproved || isActApproved)) {
          merged.proposalStatus = 'approved';
          if (merged.status !== 'completed' && merged.status !== 'cancelled') {
            merged.status = 'approved';
          }
          if (merged.lifecycleStatus !== 'completed' && merged.lifecycleStatus !== 'cancelled') {
            merged.lifecycleStatus = 'approved';
          }
          merged.approvedAt = actData?.approvedAt || evtData?.approvedAt || (event as any)?.approvedAt || merged.approvedAt;
          merged.approvedBy = actData?.approvedBy || evtData?.approvedBy || (event as any)?.approvedBy || merged.approvedBy;
        }
      }

      setLiveEvent(merged as EventDocument);
      setFullProposal((prev: any) => ({ ...prev, ...merged }));
    };


    const unsubAct = onSnapshot(doc(db, 'activities', event.id), (snap) => {
      if (snap.exists()) {
        actData = { id: snap.id, ...snap.data() };
        syncLive();
      }
    });

    const unsubEvt = onSnapshot(doc(db, 'events', event.id), (snap) => {
      if (snap.exists()) {
        evtData = { id: snap.id, ...snap.data() };
        syncLive();
      }
    });

    return () => {
      unsubAct();
      unsubEvt();
    };
  }, [event?.id]);

  const activeEvent = liveEvent || event;

  // Compute latest snapshot and differences if proposal was revised
  const latestSnapshot = useMemo(() => {
    const history =
      fullProposal?.versionHistory ||
      fullProposal?.revisionHistory ||
      (event as any)?.versionHistory ||
      (event as any)?.revisionHistory ||
      [];
    if (history.length > 0) {
      const last = history[history.length - 1];
      return (last as any)?.dataSnapshot || (last as any)?.previousSnapshot || null;
    }
    return null;
  }, [fullProposal, event]);

  const proposalDiffs = useMemo(() => {
    if (!fullProposal || !latestSnapshot) return [];
    return diffActivityProposal(latestSnapshot, fullProposal);
  }, [fullProposal, latestSnapshot]);

  const diffByPath = useMemo(() => {
    const map = new Map<string, any>();
    for (const d of proposalDiffs) {
      map.set(d.path, d);
    }
    return map;
  }, [proposalDiffs]);

  const hasRevisions = Boolean(
    (fullProposal?.version && fullProposal.version > 1) ||
    (fullProposal?.versionHistory && fullProposal.versionHistory.length > 0) ||
    (event as any)?.versionHistory?.length > 0 ||
    (event as any)?.isReturned ||
    activeEvent?.proposalStatus === 'returned'
  );

  const { data: orgs } = useOrganizationStream();
  const { eventTypes } = useEventTypesStream();
  const { venues } = useVenuesStream();
  const { data: departments = [] } = useDepartments();
  const { data: courses = [] } = useCourses();
  const { data: sections = [] } = useSections();
  const { profile } = useAdviserProfile();

  const isCancelled =
    activeEvent.isCancelled ||
    activeEvent.lifecycleStatus === 'cancelled' ||
    activeEvent.status === 'cancelled' ||
    activeEvent.proposalStatus === 'cancelled';
  const cancelCheck = canCancelEvent(activeEvent, 'admin');

  // Registry organization map for robust host resolution
  const orgMap = useMemo(() => {
    const map = new Map<string, { name: string; acronym?: string; logoUrl?: string | null }>();
    (orgs || []).forEach((o: any) => {
      map.set(o.id, { name: o.name, acronym: o.acronym || o.name, logoUrl: o.logoUrl });
    });
    return map;
  }, [orgs]);

  // Combine proposal and event payload so organization and authoring data is completely resolved
  const unifiedEventEntity = useMemo(() => {
    return {
      ...event,
      ...activeEvent,
      ...fullProposal,
      id: activeEvent.id || event.id,
      title: fullProposal.title || activeEvent.title || event.title,
      organizers: (fullProposal.organizers && fullProposal.organizers.length > 0)
        ? fullProposal.organizers
        : (activeEvent.organizers && activeEvent.organizers.length > 0)
        ? activeEvent.organizers
        : (event as any).organizers || [],
      organizationName: fullProposal.organizationName || activeEvent.organizationName || (event as any).organizationName,
      hostingOrgId: activeEvent.hostingOrgId || (event as any).hostingOrgId || (fullProposal as any).hostingOrgId,
      organizationId: activeEvent.organizationId || (event as any).organizationId || (fullProposal as any).organizationId,
      fundingSource: fullProposal.fundingSource || activeEvent.fundingSource || (event as any).fundingSource,
      isOfficerProposal: activeEvent.isOfficerProposal ?? (event as any).isOfficerProposal ?? fullProposal.isOfficerProposal,
      creatorRole: (activeEvent as any).createdByRole || (activeEvent as any).creatorRole || fullProposal.creatorRole || (event as any).creatorRole || (event as any).createdByRole,
    };
  }, [event, activeEvent, fullProposal]);

  // Determine if this activity was created directly by SAS as an Institutional Activity vs proposed by/for an Organization
  const isSasCreated = useMemo(() => {
    return isSasCreatedEvent(unifiedEventEntity, orgMap);
  }, [unifiedEventEntity, orgMap]);

  const isDirectSasEvent = isSasCreated;

  // If event originates from a student organization, utils cannot be unlocked or configured by SAS (Admin read-only)
  const isOrgManagedEvent = useMemo(() => {
    return !isSasCreated;
  }, [isSasCreated]);

  // Effective Approval Chain across all sources (live Firestore document, full proposal, and event prop)
  const displayApprovalChain: ProposalApprovalStep[] = useMemo(() => {
    let raw: ProposalApprovalStep[] = [];
    if (activeEvent?.approvalChain && Array.isArray(activeEvent.approvalChain) && activeEvent.approvalChain.length > 0) {
      raw = activeEvent.approvalChain;
    } else if (fullProposal?.approvalChain && Array.isArray(fullProposal.approvalChain) && fullProposal.approvalChain.length > 0) {
      raw = fullProposal.approvalChain;
    } else if ((event as any)?.approvalChain && Array.isArray((event as any).approvalChain) && (event as any).approvalChain.length > 0) {
      raw = (event as any).approvalChain;
    }
    return normalizeApprovalStages(raw);
  }, [activeEvent?.approvalChain, fullProposal?.approvalChain, (event as any)?.approvalChain]);

  // SAS Step in approval pipeline
  const sasStep = useMemo(() => {
    return displayApprovalChain.find(
      (s: any) =>
        s.role === 'sas_head' ||
        s.role === 'sas_coordinator' ||
        s.role === 'adviser' ||
        s.role === 'sao_head' ||
        s.id === 'step_sas_gatekeeper' ||
        s.id === 'step_sas_mandatory' ||
        (s.stageIndex === 1 && (s.stepNumber === 1 || s.step === 1) && (!s.role || s.role === 'sas_head' || s.role === 'sas_coordinator' || s.roleTitle?.toLowerCase().includes('sas') || s.roleTitle?.toLowerCase().includes('adviser'))) ||
        s.roleTitle?.toLowerCase().includes('sas') ||
        s.roleTitle?.toLowerCase().includes('student affairs') ||
        s.roleTitle?.toLowerCase().includes('adviser') ||
        (profile?.email && s.signatoryEmail?.toLowerCase() === profile.email.toLowerCase()) ||
        s.signatoryEmail?.toLowerCase() === 'sao@ormoc.sti.edu.ph'
    );
  }, [displayApprovalChain, profile?.email]);

  const isSasStepPending = Boolean(
    sasStep && sasStep.status !== 'endorsed' && sasStep.status !== 'approved'
  );

  const hasSubsequentStages = useMemo(() => {
    return displayApprovalChain.some((s: any) => (s.stageIndex || 1) > 1);
  }, [displayApprovalChain]);

  const isCompleted =
    activeEvent.status === 'Completed' ||
    activeEvent.status === 'completed' ||
    activeEvent.lifecycleStatus === 'completed' ||
    activeEvent.lifecycleStatus === 'concluded' ||
    activeEvent.proposalStatus === 'completed' ||
    (activeEvent as any).isConcluded === true ||
    (activeEvent as any).isArchived === true;

  // Multi-tiered check: Officially approved activities are unlocked
  const isApproved = useMemo(() => {
    if (isCancelled) return false;
    if (isCompleted) return true;

    const chain: any[] = displayApprovalChain || [];
    const hasChain = Array.isArray(chain) && chain.length > 0;
    const fullySigned = isProposalFullySigned(chain);

    // 1. If an approval chain is configured and fully signed, the proposal is officially approved
    if (hasChain && fullySigned) {
      return true;
    }

    // 2. Direct explicit approval on activeEvent, liveEvent, or fullProposal
    const activeSt = (activeEvent.status || '').toLowerCase().trim();
    const activePropSt = (activeEvent.proposalStatus || '').toLowerCase().trim();
    const activeLc = (activeEvent.lifecycleStatus || '').toLowerCase().trim();
    if (
      activeSt === 'approved' ||
      activeSt === 'approved_president' ||
      activePropSt === 'approved' ||
      activeLc === 'approved' ||
      activeLc === 'published' ||
      activeEvent.isApproved === true ||
      Boolean(activeEvent.approvedAt)
    ) {
      return true;
    }

    const liveSt = ((liveEvent as any)?.status || '').toLowerCase().trim();
    const livePropSt = ((liveEvent as any)?.proposalStatus || '').toLowerCase().trim();
    if (liveSt === 'approved' || liveSt === 'approved_president' || livePropSt === 'approved' || (liveEvent as any)?.isApproved === true) {
      return true;
    }

    const fullSt = (fullProposal?.status || '').toLowerCase().trim();
    const fullPropSt = (fullProposal?.proposalStatus || '').toLowerCase().trim();
    if (fullSt === 'approved' || fullSt === 'approved_president' || fullPropSt === 'approved' || fullProposal?.isApproved === true) {
      return true;
    }

    // 3. Active campus timing or published states (only approved activities reach these states)
    if (
      activeSt === 'upcoming' ||
      activeSt === 'active' ||
      activeSt === 'ongoing' ||
      activeSt === 'published' ||
      activeLc === 'ongoing' ||
      activeLc === 'upcoming'
    ) {
      return true;
    }

    // 4. Fallback guard: Explicit rejection, return, or pending states
    const primaryCandidates = [activeEvent, liveEvent].filter(Boolean);
    for (const c of primaryCandidates) {
      const pStatus = ((c as any).proposalStatus || '').toLowerCase().trim();
      const st = ((c as any).status || '').toLowerCase().trim();
      const lc = ((c as any).lifecycleStatus || '').toLowerCase().trim();
      const isRet = Boolean((c as any).isReturned);
      if (
        pStatus === 'rejected' ||
        st === 'rejected' ||
        lc === 'rejected' ||
        pStatus === 'returned' ||
        pStatus === 'returned_for_revision' ||
        st === 'returned' ||
        lc === 'returned' ||
        isRet ||
        pStatus === 'draft' ||
        st === 'draft' ||
        pStatus === 'pending' ||
        pStatus === 'pending_review' ||
        pStatus === 'under_review' ||
        st === 'under_review' ||
        lc === 'pending_review'
      ) {
        return false;
      }
    }

    return false;
  }, [
    isCancelled,
    isCompleted,
    displayApprovalChain,
    activeEvent,
    liveEvent,
    event,
    fullProposal,
  ]);

  const isAlreadyPublished = Boolean(
    (activeEvent as any)?.isPublished === true ||
    activeEvent?.status === 'published' ||
    activeEvent?.lifecycleStatus === 'published' ||
    (activeEvent as any)?.isDirectPublished === true
  );

  // Adviser Decision panel should ONLY show if and only if the proposal is coming from an Org AND SAS needs to review it
  const showAdviserDecision = useMemo(() => {
    if (isCancelled || isApproved || isCompleted) return false;
    // Must be an Org proposal, NOT authored/created by SAS
    if (isSasCreated) return false;

    // If an approval chain exists:
    if (displayApprovalChain && displayApprovalChain.length > 0) {
      if (sasStep) {
        // If SAS is in the chain and has already signed/endorsed, SAS does NOT need to review it
        if (sasStep.status === 'endorsed' || sasStep.status === 'approved') {
          return false;
        }
        return true;
      }
      // If SAS is not in the chain, it's an Org proposal in routing:
      // SAS can review if stage 1 is currently active/pending
      const isFirstStageActive = displayApprovalChain.some(
        (s: any) => (s.stageIndex === 1 || !s.stageIndex) && s.status !== 'approved' && s.status !== 'endorsed'
      );
      return isFirstStageActive;
    }

    // If no chain, Org proposal pending in SAS admin needs review
    return true;
  }, [isCancelled, isApproved, isCompleted, isSasCreated, displayApprovalChain, sasStep]);


  const initialDecision: Decision = isApproved
    ? 'approved'
    : (activeEvent.proposalStatus || '').toLowerCase() === 'rejected'
      ? 'rejected'
      : (activeEvent.proposalStatus || '').toLowerCase() === 'returned'
        ? 'returned'
        : 'none';

  const [decision, setDecision] = useState<Decision>(initialDecision);

  useEffect(() => {
    if (isApproved) {
      setDecision('approved');
    } else if ((activeEvent.proposalStatus || '').toLowerCase() === 'rejected') {
      setDecision('rejected');
    } else if ((activeEvent.proposalStatus || '').toLowerCase() === 'returned') {
      setDecision('returned');
    }
  }, [isApproved, activeEvent.proposalStatus]);

  const [showConcludeModal, setShowConcludeModal] = useState(false);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const timing = getEventTimingStatus(activeEvent);

  // Financial projections hydration
  const financialProjections = useMemo(() => {
    if (
      fullProposal.financialProjections &&
      (fullProposal.financialProjections.revenues || fullProposal.financialProjections.expenses)
    ) {
      return fullProposal.financialProjections;
    }
    const expenses: FinancialLineItem[] = (event.budgetItems || []).map((b, i) => ({
      id: b.id || `exp-${i + 1}`,
      description: b.item || 'Expense Item',
      lastYearActual: 0,
      thisYearProposed: (b.unitCost || 0) * (b.quantity || 1),
      totalAmount: Number(b.approvedAmount || (b.unitCost || 0) * (b.quantity || 1)),
      adjustment: 0,
      remarks: b.description || '',
    }));
    const totalExpenses = expenses.reduce((s, e) => s + (e.totalAmount || 0), 0);
    return {
      revenues: [],
      expenses,
      totalRevenue: 0,
      totalExpenses,
      balance: -totalExpenses,
    };
  }, [fullProposal.financialProjections, event.budgetItems]);

  const totalExpenseAmount =
    Number(financialProjections.totalExpenses) ||
    financialProjections.expenses.reduce((s: number, e: any) => s + Number(e.totalAmount || 0), 0);
  const totalRevenueAmount =
    Number(financialProjections.totalRevenue) ||
    financialProjections.revenues.reduce((s: number, r: any) => s + Number(r.totalAmount || 0), 0);
  const projectedBalance = totalRevenueAmount - totalExpenseAmount;

  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const centerRef = useRef<HTMLDivElement>(null);

  const scrollTo = (id: string) => {
    setActiveSection(id);
    setVisitedSections((prev) => new Set([...prev, id]));
    const el = sectionRefs.current[id];
    if (el && centerRef.current) {
      centerRef.current.scrollTo({ top: el.offsetTop - 24, behavior: 'smooth' });
    }
  };

  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [isAttendanceModalOpen, setIsAttendanceModalOpen] = useState(false);
  const [isCashModalOpen, setIsCashModalOpen] = useState(false);
  const [isDisbursementVoucherModalOpen, setIsDisbursementVoucherModalOpen] = useState(false);
  const currentDisbursementVoucher =
    (activeEvent as any)?.disbursementVoucher ||
    event.disbursementVoucher ||
    fullProposal?.disbursementVoucher ||
    null;
  const hasDisbursementVoucher = Boolean(currentDisbursementVoucher?.fileUrl);

  // Funding source resolution & disbursement requirements
  const effectiveFundingSource = useMemo(() => {
    const explicit =
      fullProposal?.fundingSource ||
      (activeEvent as any)?.fundingSource ||
      (event as any)?.fundingSource;
    if (explicit) return explicit;
    return isSasCreated ? 'school_budget' : 'organization_funds';
  }, [fullProposal?.fundingSource, activeEvent, event, isSasCreated]);

  const isOrgLedger = effectiveFundingSource === 'organization_funds';
  const isZeroBudget = effectiveFundingSource === 'zero_budget';
  const isSchoolBudget = effectiveFundingSource === 'school_budget';

  const isLiquidationExempt = useMemo(() => {
    return isEventLiquidationExempt(unifiedEventEntity);
  }, [unifiedEventEntity]);

  // School disbursement voucher is strictly only required if funded by the school with an expense budget > 0
  const isVoucherRequired = useMemo(() => {
    if (isLiquidationExempt || !isSchoolBudget) return false;
    const totalExp = Number(totalExpenseAmount || (event as any).totalApprovedBudget || (activeEvent as any).totalApprovedBudget || 0);
    return totalExp > 0;
  }, [isLiquidationExempt, isSchoolBudget, totalExpenseAmount, event, activeEvent]);

  const [isUtilsOpen, setIsUtilsOpen] = useState(false);
  const utilsDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (utilsDropdownRef.current && !utilsDropdownRef.current.contains(e.target as Node)) {
        setIsUtilsOpen(false);
      }
    };
    if (isUtilsOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isUtilsOpen]);

  const handleUpdateFundingSource = async (newSource: 'organization_funds' | 'school_budget' | 'zero_budget') => {
    try {
      if (event?.id) {
        await updateDoc(doc(db, 'events', event.id), {
          fundingSource: newSource,
          updatedAt: new Date().toISOString(),
        });
      }
      const propId = (event as any)?.proposalId || fullProposal?.id || event?.id;
      if (propId) {
        try {
          await updateDoc(doc(db, 'activity_proposals', propId), {
            fundingSource: newSource,
            updatedAt: new Date().toISOString(),
          });
        } catch (e) {
          console.warn('Could not update activity_proposals doc directly:', e);
        }
      }
      setActiveEvent((prev: any) => ({ ...prev, fundingSource: newSource }));
      setFullProposal((prev: any) => ({ ...prev, fundingSource: newSource }));
      setIsFundingSourceMenuOpen(false);
      toast.success(
        newSource === 'organization_funds'
          ? 'Funding set to Organization Treasury Ledger. School disbursement voucher not required.'
          : newSource === 'zero_budget'
          ? 'Funding set to Zero Budget (₱0.00).'
          : 'Funding set to School Budget (Institutional Voucher required).'
      );
    } catch (err) {
      console.error('Failed to update funding source:', err);
      toast.error('Failed to update funding source');
    }
  };
  const navItems = NAV_SECTIONS;

  const allVisited = navItems.every((s) => visitedSections.has(s.id));
  const remarksWritten = remarks.trim().length > 0;

  const [savingRemarks, setSavingRemarks] = useState(false);

  const handleSaveRemarks = async () => {
    if (!event?.id) return;
    setSavingRemarks(true);
    try {
      await updateAdviserRemarks(event.id, remarks);
      toast.success('Adviser remarks updated successfully!');
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Failed to save remarks.');
    } finally {
      setSavingRemarks(false);
    }
  };

  const handleDecision = (type: 'approve' | 'return' | 'reject') => {
    setRemarksError(false);
    setActiveModal(type);
  };

  const confirmApprove = async () => {
    if (!profile?.uid) {
      toast.error('SAO Admin authentication is required to approve proposals. Please re-login as Admin.');
      return;
    }
    setSubmitting(true);
    try {
      const currentSasConfig = await getSasSignatoryConfig();
      const effectiveSig = modalSignatureDataUrl || currentSasConfig.signatureUrl || undefined;

      // If user drew a new signature in the modal, persist it to SAS Signatory Maintenance
      if (modalSignatureDataUrl && modalSignatureDataUrl !== currentSasConfig.signatureUrl) {
        await saveSasSignatoryConfig({
          ...currentSasConfig,
          signatureUrl: modalSignatureDataUrl,
          signatureDataUrl: modalSignatureDataUrl,
        });
      }

      let chainHandled = false;

      // If proposal has an approval chain and Stage 1 SAS step is pending
      if (displayApprovalChain.length > 0 && isSasStepPending) {
        await endorseProposal(
          activeEvent.id,
          {
            uid: profile.uid,
            id: profile.uid,
            name: currentSasConfig.name || sasConfig.name || profile.displayName || 'Riselle Mae B. Lucanas',
            email: currentSasConfig.email || sasConfig.email || profile.email || 'sao@ormoc.sti.edu.ph',
            roleTitle: currentSasConfig.roleTitle || sasConfig.roleTitle || 'Student Affairs & Services Head',
            role: 'sas_head',
            actionType: hasSubsequentStages ? 'endorse' : 'approve',
            signatureUrl: effectiveSig,
          },
          remarks || ''
        );
        chainHandled = true;
      }

      // If there are no subsequent stages or no approval chain, or final approval, approve the event
      if (!hasSubsequentStages || !chainHandled) {
        await approveEvent(activeEvent.id, profile.uid, remarks || '');
      }

      setDecision('approved');
      setActiveModal('none');

      const isAdvancingChain = hasSubsequentStages && chainHandled;

      setLiveEvent((prev: any) => ({
        ...prev,
        proposalStatus: isAdvancingChain ? 'under_review' : 'approved',
        status: isAdvancingChain ? 'pending' : 'approved',
        lifecycleStatus: isAdvancingChain ? 'pending' : 'approved',
        isApproved: !isAdvancingChain,
        isReturned: false,
        returnFlags: [],
        stepRevisionRemarks: null,
        approvedBy: profile.uid,
        approvedAt: new Date() as any,
        adviserRemarks: remarks?.trim() || null,
      }));

      setFullProposal((prev: any) => ({
        ...prev,
        proposalStatus: isAdvancingChain ? 'under_review' : 'approved',
        status: isAdvancingChain ? 'under_review' : 'approved',
        lifecycleStatus: isAdvancingChain ? 'pending' : 'approved',
        isApproved: !isAdvancingChain,
        isReturned: false,
        returnFlags: [],
        stepRevisionRemarks: null,
        approvedBy: profile.uid,
        approvedAt: new Date() as any,
        adviserRemarks: remarks?.trim() || null,
      }));

      if (isAdvancingChain) {
        toast.success(
          `Stage 1 endorsed and digitally signed as ${currentSasConfig.name}! Proposal forwarded to Stage 2.`
        );
      } else {
        toast.success('Activity proposal approved successfully! Operational studio unlocked.');
      }
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Failed to approve proposal.');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmReject = async () => {
    if (!profile?.uid) {
      toast.error('SAO Admin authentication is required to reject proposals. Please re-login as Admin.');
      return;
    }
    if (!rejectionReason) {
      toast.error('Please select a rejection reason category.');
      return;
    }
    if (!remarks.trim()) {
      setRemarksError(true);
      toast.error('Please provide remarks/feedback explaining the rejection.');
      return;
    }
    setSubmitting(true);
    try {
      await rejectEvent(event.id, profile.uid, rejectionReason, remarks, false);
      setDecision('rejected');
      setActiveModal('none');
      toast.success('Activity proposal rejected successfully.');
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Failed to reject proposal.');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmReturn = async () => {
    if (!profile?.uid) {
      toast.error('SAO Admin authentication is required to return proposals. Please re-login as Admin.');
      return;
    }
    if (returnFlags.length === 0) {
      toast.error('Please select at least one flagged section to correct.');
      return;
    }
    // Verify each selected step has a specific remark
    const flaggedItems = RETURN_FLAGS_GROUPED.filter((item) => returnFlags.includes(item.flag));
    const missingRemarks = flaggedItems.filter(
      (item) => !(
        stepRemarks[item.stepNumber]?.trim() ||
        stepRemarks[item.flag]?.trim() ||
        stepRemarks[`step-${item.stepNumber}`]?.trim() ||
        stepRemarks[`step_${item.stepNumber}`]?.trim()
      )
    );
    if (missingRemarks.length > 0) {
      toast.error(`Please provide specific revision remarks for: ${missingRemarks.map((m) => m.label).join(', ')}.`);
      return;
    }

    setSubmitting(true);
    try {
      await returnEvent(
        event.id,
        profile.uid,
        returnFlags,
        returnDeadline,
        remarks?.trim() || 'Returned with specific per-step revision instructions.',
        stepRemarks,
        profile.displayName || 'SAO Administrator'
      );
      setDecision('returned');
      setActiveModal('none');
      toast.success('Proposal returned for revision with step-by-step remarks.');
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Failed to return proposal.');
    } finally {
      setSubmitting(false);
    }
  };

  const isSas = isSasCreated;
  const orgName = useMemo(() => resolveCleanOrgName(unifiedEventEntity, orgMap), [unifiedEventEntity, orgMap]);
  const orgAcronym = useMemo(() => resolveCleanOrgAcronym(unifiedEventEntity, orgMap), [unifiedEventEntity, orgMap]);
  const orgLogo = useMemo(() => {
    if (isSasCreated) return stiOrmocLogo;
    const hId = activeEvent.hostingOrgId || (event as any).hostingOrgId;
    if (hId && orgMap.has(hId)) return orgMap.get(hId)?.logoUrl || null;
    for (const [, meta] of orgMap.entries()) {
      if (
        meta.name.toLowerCase() === orgName.toLowerCase() ||
        (meta.acronym && meta.acronym.toLowerCase() === orgAcronym.toLowerCase())
      ) {
        return meta.logoUrl || null;
      }
    }
    return null;
  }, [isSasCreated, activeEvent.hostingOrgId, event, orgMap, orgName, orgAcronym]);
  const eventTypeName = eventTypes.find((t) => t.id === event.eventTypeId)?.name || 'General Activity';
  const venueObj = venues.find((v) => v.id === event.venueId);
  const venueName = venueObj ? venueObj.name : event.customVenueName || event.venueId || 'On-Campus Venue';

  const [exportingPdf, setExportingPdf] = useState(false);

  // Official Form AP-01 PDF Export
  const handleExportPDF = async () => {
    setExportingPdf(true);
    try {
      await exportActivityProposalPDF({
        ...fullProposal,
        title: fullProposal.title || event.title,
        referenceNo: fullProposal.referenceNo || event.referenceId || 'AP-2026-PENDING',
        submissionDate:
          fullProposal.submissionDate ||
          (event.createdAt ? formatAppDate(event.createdAt, 'N/A') : new Date().toLocaleDateString()),
        status: (fullProposal.status || (isApproved ? 'approved_president' : 'under_review')) as any,
        organizers: fullProposal.organizers || [orgName],
        proponents: fullProposal.proponents || (event.createdByName ? [event.createdByName] : [orgName]),
        objectives: fullProposal.objectives || event.objectives || [],
        successIndicators: fullProposal.successIndicators || [],
        mechanics: fullProposal.mechanics || [],
        materials: fullProposal.materials || [],
        targetAudience: fullProposal.targetAudience || {
          academicLevels:
            event.targetAcademicLevel === 'BOTH'
              ? ['SHS', 'College']
              : event.targetAcademicLevel === 'SHS'
                ? ['SHS']
                : ['College'],
          yearLevels: event.targetYearLevels || [],
          departments: targetDeptNames || [],
          courses: event.targetCourses || [],
          allStudents: !event.targetCourses?.length && !event.targetYearLevels?.length,
        },
        estimatedAttendance:
          fullProposal.estimatedAttendance || `${event.expectedParticipantCount || 0} Participants`,
        marketingPlan: fullProposal.marketingPlan || [],
        documentationPlan: fullProposal.documentationPlan || [],
        sessions: (fullProposal.sessions || event.sessions || []).map((s: any) => ({
          id: s.id,
          title: s.title,
          date: s.date,
          startTime: s.startTime,
          endTime: s.endTime,
          venueName: s.venueName || venueName,
        })),
        tasks: fullProposal.tasks || [],
        financialProjections: financialProjections,
        approvalChain: fullProposal.approvalChain || (event as any).approvalChain || [],
      });
      toast.success('Activity Proposal Form AP-01 exported successfully!');
    } catch (err: any) {
      console.error(err);
      toast.error('Failed to export Form AP-01 PDF.');
    } finally {
      setExportingPdf(false);
    }
  };

  const statusColors: Record<string, { bg: string; text: string; label: string; icon: any }> = {
    draft: { bg: 'bg-gray-100 text-gray-700 border-gray-300', text: 'text-gray-700', label: 'Draft Proposal', icon: Clock },
    pending: { bg: 'bg-amber-50 text-amber-800 border-amber-300', text: 'text-amber-700', label: 'Pending Review', icon: Clock },
    pending_review: { bg: 'bg-amber-50 text-amber-800 border-amber-300', text: 'text-amber-700', label: 'Pending Review', icon: Clock },
    under_review: { bg: 'bg-amber-50 text-amber-800 border-amber-300', text: 'text-amber-700', label: 'Pending Review', icon: Clock },
    approved: { bg: 'bg-emerald-50 text-emerald-800 border-emerald-300', text: 'text-emerald-700', label: isSasCreated ? 'Active Activity' : 'Approved Activity', icon: CheckCircle2 },
    upcoming: { bg: 'bg-emerald-50 text-emerald-800 border-emerald-300', text: 'text-emerald-700', label: isSasCreated ? 'Active Activity' : 'Approved Activity', icon: CheckCircle2 },
    active: { bg: 'bg-emerald-50 text-emerald-800 border-emerald-300', text: 'text-emerald-700', label: isSasCreated ? 'Active Activity' : 'Approved Activity', icon: CheckCircle2 },
    published: { bg: 'bg-emerald-50 text-emerald-800 border-emerald-300', text: 'text-emerald-700', label: 'Published Activity', icon: CheckCircle2 },
    ongoing: { bg: 'bg-indigo-50 text-indigo-800 border-indigo-300', text: 'text-indigo-700', label: 'Ongoing Activity', icon: CheckCircle2 },
    completed: { bg: 'bg-blue-50 text-blue-800 border-blue-300', text: 'text-blue-700', label: 'Completed Activity', icon: CheckCircle2 },
    returned: { bg: 'bg-amber-50 text-amber-800 border-amber-300', text: 'text-amber-700', label: 'Returned for Revision', icon: RotateCcw },
    rejected: { bg: 'bg-red-50 text-red-800 border-red-300', text: 'text-red-700', label: 'Rejected Proposal', icon: XCircle },
    cancelled: { bg: 'bg-red-50 text-red-800 border-red-300', text: 'text-red-700', label: 'Cancelled Activity', icon: XCircle },
  };

  const currentStatusKey = isCancelled
    ? 'cancelled'
    : isCompleted
      ? 'completed'
      : (isApproved || decision === 'approved')
        ? 'approved'
        : decision === 'rejected' || (activeEvent.proposalStatus || '').toLowerCase() === 'rejected'
          ? 'rejected'
          : decision === 'returned' || (activeEvent.proposalStatus || '').toLowerCase() === 'returned'
            ? 'returned'
            : (activeEvent.proposalStatus || activeEvent.status || 'draft').toLowerCase();
  const currentStatus = (isApproved || decision === 'approved')
    ? statusColors.approved
    : (statusColors[currentStatusKey] || statusColors.draft);
  const StatusIcon = currentStatus.icon;

  const targetDeptNames = (event.targetDepartmentIds || [])
    .map((dId) => {
      const match = departments.find((d) => d.id === dId || d.code === dId);
      return match ? `${match.name} (${match.code})` : dId;
    })
    .filter(Boolean);

  const targetCourseLabels = useMemo(() => {
    const rawCourses = event.targetCourses || (event as any).allowedCourses || [];
    if (!rawCourses || rawCourses.length === 0) return [];
    return rawCourses.map((cId: string) => {
      const match = courses.find((c) => c.id === cId || c.code.toLowerCase() === cId.toLowerCase());
      return match ? `${match.code} - ${match.name}` : cId;
    });
  }, [event.targetCourses, (event as any).allowedCourses, courses]);

  const targetSectionLabels = useMemo(() => {
    const rawSections = event.targetSections || [];
    if (!rawSections || rawSections.length === 0) return [];
    return rawSections.map((sId: string) => {
      const match = sections.find((s) => s.id === sId || s.name.toLowerCase() === sId.toLowerCase());
      return match ? match.name : sId;
    });
  }, [event.targetSections, sections]);

  // Proponents & Organizers
  const proponentsList: string[] = useMemo(() => {
    if (fullProposal.proponents && Array.isArray(fullProposal.proponents) && fullProposal.proponents.length > 0) {
      return fullProposal.proponents;
    }
    return event.createdByName ? [event.createdByName] : ['Activity Committee'];
  }, [fullProposal.proponents, event.createdByName]);

  const organizersList: string[] = useMemo(() => {
    let list: string[] = [];
    if (fullProposal.organizers && Array.isArray(fullProposal.organizers) && fullProposal.organizers.length > 0) {
      list = fullProposal.organizers;
    } else if (Array.isArray(activeEvent.organizers) && activeEvent.organizers.length > 0) {
      list = activeEvent.organizers;
    } else {
      list = [orgName];
    }
    // If list has student clubs, filter out SAS institutional label so it's not mashed or duplicated
    const studentClubs = list.filter((item) => stripSasPhrases(item).length > 0);
    if (studentClubs.length > 0) {
      return studentClubs.map((c) => {
        const stripped = stripSasPhrases(c);
        return resolveCleanOrgName({ organizers: [stripped], organizationName: stripped }, orgMap);
      });
    }
    return ['Student Affairs & Services (SAS)'];
  }, [fullProposal.organizers, activeEvent.organizers, orgName, orgMap]);

  // Objectives & Success Indicators
  const objectivesList: string[] = fullProposal.objectives || event.objectives || [];
  const successIndicatorsList: string[] = fullProposal.successIndicators || [];

  // Mechanics & Materials
  const mechanicsList: string[] = fullProposal.mechanics || [];
  const materialsList: string[] = fullProposal.materials || [];

  // Marketing & Documentation
  const marketingPlanList: string[] = fullProposal.marketingPlan || [];
  const documentationPlanList: string[] = fullProposal.documentationPlan || [];

  // Tasks
  const tasksList: any[] = fullProposal.tasks || [];

  // Custodians
  const budgetCustodians: any[] = event.budgetCustodians || fullProposal.budgetCustodians || [];
  const totalAllocatedToCustodians = budgetCustodians.reduce((s, c) => s + (Number(c.allocatedAmount) || 0), 0);

  // Effective Proposal History across all sources + synthesized from signed steps if empty
  const displayProposalHistory = useMemo(() => {
    const rawHistory =
      (activeEvent.proposalHistory && Array.isArray(activeEvent.proposalHistory) && activeEvent.proposalHistory.length > 0 ? activeEvent.proposalHistory : null) ||
      (fullProposal?.proposalHistory && Array.isArray(fullProposal.proposalHistory) && fullProposal.proposalHistory.length > 0 ? fullProposal.proposalHistory : null) ||
      (event.proposalHistory && Array.isArray(event.proposalHistory) && event.proposalHistory.length > 0 ? event.proposalHistory : null) ||
      [];

    if (rawHistory.length > 0) return rawHistory;

    // Fallback: If no explicit proposalHistory array exists in Firestore yet, synthesize from signed approvalChain steps
    const signedSteps = displayApprovalChain.filter(
      (s: any) => s.status === 'endorsed' || s.status === 'approved' || Boolean(s.signedAt) || Boolean(s.signatureUrl)
    );
    if (signedSteps.length > 0) {
      return signedSteps.map((s: any, idx: number) => ({
        id: s.id || `sig-hist-${idx}`,
        action: s.status === 'approved' ? 'approved' : 'endorsed',
        performedByName: s.signerName ? `${s.signerName} (${s.roleTitle || 'Signatory'})` : s.roleTitle || 'Institutional Signatory',
        performedAt: s.signedAt || event.createdAt || new Date(),
        remarks: s.remarks || `Electronically endorsed & authorized by ${s.roleTitle || 'Signatory'}.`,
        signatureUrl: s.signatureUrl,
      }));
    }

    return [];
  }, [activeEvent.proposalHistory, fullProposal?.proposalHistory, event.proposalHistory, displayApprovalChain, event.createdAt]);

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col overflow-hidden animate-in fade-in duration-200">
      {/* Top Navigation Bar — Clean STI Navy Look */}
      <header className="h-16 bg-[#001A4D] border-b border-[#0E4EBD]/30 flex items-center justify-between px-6 flex-shrink-0 z-20 shadow-md">
        <div className="flex items-center gap-4">
          <button
            onClick={onClose}
            className="flex items-center gap-2 text-white/80 hover:text-white hover:bg-white/10 px-3 py-1.5 rounded-lg transition-colors text-xs font-semibold cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Activity Approvals</span>
          </button>
          <div className="h-5 w-px bg-white/20" />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-[#FFD41C]">
                {fullProposal.referenceNo || event.referenceId || 'AP-2026-REF'}
              </span>
              <span className="text-white/40">·</span>
              <span className="text-white font-bold text-sm truncate max-w-[280px] lg:max-w-md">
                {fullProposal.title || event.title}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Funding Source Badge: Only shown if Org-created; SAS activities are automatically school budget so no badge needed */}
          {isOrgManagedEvent && (
            <div
              className={`px-3 py-1 rounded-full text-xs font-semibold border flex items-center gap-1.5 shadow-2xs select-none ${
                isOrgLedger
                  ? 'bg-white/10 text-white border-white/20'
                  : isZeroBudget
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30'
                  : 'bg-sky-500/20 text-sky-300 border-sky-400/30'
              }`}
              title="Official Funding Source for this Organization Activity (Read Only)"
            >
              {isOrgLedger ? (
                <Building2 className="w-3.5 h-3.5 text-[#FFD41C]" />
              ) : isZeroBudget ? (
                <Receipt className="w-3.5 h-3.5 text-emerald-300" />
              ) : (
                <Building2 className="w-3.5 h-3.5 text-sky-300" />
              )}
              <span>
                {isOrgLedger
                  ? 'Organization Treasury'
                  : isZeroBudget
                  ? '₱0 Budget (Non-monetary)'
                  : 'School Budget'}
              </span>
            </div>
          )}

          {/* Status Badge */}
          <div className={`px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-1.5 ${currentStatus.bg}`}>
            <StatusIcon className="w-3.5 h-3.5" />
            <span>{currentStatus.label}</span>
          </div>

          {/* Export PDF (Form AP-01 Official Engine) */}
          <button
            onClick={handleExportPDF}
            disabled={exportingPdf}
            className="px-3.5 py-1.5 bg-[#FFD41C] text-[#001A4D] hover:bg-amber-400 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
            title="Download Official STI Form AP-01 PDF"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{exportingPdf ? 'Generating Form AP-01...' : 'Export Form AP-01'}</span>
          </button>

          {/* Activity Utilities (Utils Dropdown Menu — STI Clean Theme) */}
          <div className="relative" ref={utilsDropdownRef}>
            <button
              type="button"
              onClick={() => setIsUtilsOpen((prev) => !prev)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer select-none ${
                isUtilsOpen
                  ? 'bg-white text-[#001A4D] shadow-sm ring-2 ring-white/30'
                  : 'bg-white/10 hover:bg-white/20 text-white border border-white/15 active:scale-95'
              }`}
              title="Open Activity Utilities & Operations"
            >
              <SlidersHorizontal className={`w-3.5 h-3.5 ${isUtilsOpen ? 'text-[#0E4EBD]' : 'text-[#FFD41C]'}`} />
              <span>Utils</span>
              {hasRevisions && (
                <span className="px-1.5 py-0.2 rounded-full bg-[#FFD41C] text-[#001A4D] text-[10px] font-black" title={`${proposalDiffs.length} revision(s)`}>
                  {proposalDiffs.length}
                </span>
              )}
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isUtilsOpen ? 'rotate-180 text-[#001A4D]' : 'text-white/70'}`} />
            </button>

            {isUtilsOpen && (
              <div className="absolute right-0 mt-2 w-88 max-w-[94vw] bg-white border border-slate-200 rounded-2xl shadow-2xl z-50 overflow-hidden text-xs animate-in fade-in zoom-in-95 duration-150 max-h-[85vh] flex flex-col ring-1 ring-black/5">
                {/* Utilities Header — STI Navy Brand Header */}
                <div className="px-4 py-3 bg-[#001A4D] text-white flex items-center justify-between shrink-0 border-b border-white/10">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                      <SlidersHorizontal className="w-3.5 h-3.5 text-[#FFD41C]" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white leading-tight">Activity Utilities</div>
                      <p className="text-[10px] text-blue-200/80 leading-tight">Tools & operations</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-white/15 text-[#FFD41C] border border-white/20">
                    {fullProposal.referenceNo || event.referenceId || 'AP'}
                  </span>
                </div>

                <div className="overflow-y-auto p-2.5 space-y-3 flex-1 bg-white divide-y divide-slate-100">
                  {/* Section 1: Operations & Student App */}
                  <div className="space-y-1">
                    <div className="px-2 pt-1 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Operations & Engagement
                    </div>

                    {/* 1. Mobile App Feed */}
                    <button
                      type="button"
                      disabled={!isApproved || isAlreadyPublished}
                      onClick={() => {
                        if (!isApproved) {
                          toast.error('Locked: Proposal must be approved before configuring student mobile feed.');
                          return;
                        }
                        if (isAlreadyPublished) {
                          toast.info('Lockout: This activity has already been published to the student mobile app.');
                          return;
                        }
                        setIsUtilsOpen(false);
                        setIsPublishModalOpen(true);
                      }}
                      className={`w-full text-left p-2.5 rounded-xl flex items-center justify-between gap-3 transition-colors ${
                        !isApproved
                          ? 'opacity-60 cursor-not-allowed hover:bg-gray-50'
                          : isAlreadyPublished
                          ? 'cursor-not-allowed opacity-90 hover:bg-gray-50'
                          : 'hover:bg-blue-50/60 cursor-pointer active:scale-[0.99]'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          !isApproved
                            ? 'bg-amber-50 text-amber-600 border border-amber-200'
                            : isAlreadyPublished
                            ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                            : isOrgManagedEvent
                            ? 'bg-blue-50 text-[#0E4EBD] border border-blue-200'
                            : 'bg-blue-50 text-[#0E4EBD] border border-blue-200'
                        }`}>
                          {!isApproved ? (
                            <Lock className="w-4 h-4" />
                          ) : isAlreadyPublished ? (
                            <CheckCircle2 className="w-4 h-4" />
                          ) : isOrgManagedEvent ? (
                            <Eye className="w-4 h-4" />
                          ) : (
                            <Smartphone className="w-4 h-4" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-gray-900 truncate">
                            {isOrgManagedEvent ? 'Mobile Feed (View Only)' : isAlreadyPublished ? 'Mobile Feed (Published)' : 'Publish to Student App'}
                          </div>
                          <div className="text-[11px] text-gray-500 truncate">
                            {!isApproved
                              ? 'Locked: Approval required first'
                              : isAlreadyPublished
                              ? 'Live on student mobile feed'
                              : isOrgManagedEvent
                              ? 'Managed by student club'
                              : 'Banner, notifications & audience'}
                          </div>
                        </div>
                      </div>
                      <div className="shrink-0">
                        {!isApproved ? (
                          <span className="text-[10px] font-bold uppercase font-mono px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                            Locked
                          </span>
                        ) : isAlreadyPublished ? (
                          <span className="text-[10px] font-bold uppercase font-mono px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Published
                          </span>
                        ) : isOrgManagedEvent ? (
                          <span className="text-[10px] font-bold uppercase font-mono px-2 py-0.5 rounded-full bg-blue-50 text-[#0E4EBD] border border-blue-200">
                            Club
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold uppercase font-mono px-2.5 py-0.5 rounded-full bg-blue-600 text-white shadow-2xs">
                            Configure
                          </span>
                        )}
                      </div>
                    </button>

                    {/* 2. Attendance & QR Scanners */}
                    <button
                      type="button"
                      disabled={!isApproved || !isAlreadyPublished}
                      onClick={() => {
                        if (!isApproved) {
                          toast.error('Locked: Proposal must be approved before configuring attendance and scanners.');
                          return;
                        }
                        if (!isAlreadyPublished) {
                          toast.error('Locked: Activity must be published to the mobile app first before configuring attendance and scanners.');
                          return;
                        }
                        setIsUtilsOpen(false);
                        setIsAttendanceModalOpen(true);
                      }}
                      className={`w-full text-left p-2.5 rounded-xl flex items-center justify-between gap-3 transition-colors ${
                        !isApproved || !isAlreadyPublished
                          ? 'opacity-60 cursor-not-allowed hover:bg-gray-50'
                          : 'hover:bg-blue-50/60 cursor-pointer active:scale-[0.99]'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          !isApproved || !isAlreadyPublished
                            ? 'bg-amber-50 text-amber-600 border border-amber-200'
                            : 'bg-indigo-50 text-indigo-600 border border-indigo-200'
                        }`}>
                          {!isApproved || !isAlreadyPublished ? (
                            <Lock className="w-4 h-4" />
                          ) : isOrgManagedEvent ? (
                            <Eye className="w-4 h-4" />
                          ) : (
                            <QrCode className="w-4 h-4" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-gray-900 truncate">
                            {isOrgManagedEvent ? 'Attendance & Scanners (View Only)' : 'Attendance & QR Scanners'}
                          </div>
                          <div className="text-[11px] text-gray-500 truncate">
                            {!isApproved
                              ? 'Locked: Approval required'
                              : !isAlreadyPublished
                              ? 'Publish to mobile app first'
                              : 'QR check-in & designated scanners'}
                          </div>
                        </div>
                      </div>
                      <div className="shrink-0">
                        {!isApproved ? (
                          <span className="text-[10px] font-bold uppercase font-mono px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                            Locked
                          </span>
                        ) : !isAlreadyPublished ? (
                          <span className="text-[10px] font-bold uppercase font-mono px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                            Unpublished
                          </span>
                        ) : isOrgManagedEvent ? (
                          <span className="text-[10px] font-bold uppercase font-mono px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                            Club
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold uppercase font-mono px-2.5 py-0.5 rounded-full bg-indigo-600 text-white shadow-2xs">
                            Manage
                          </span>
                        )}
                      </div>
                    </button>
                  </div>

                  {/* Section 2: Finance & Liquidation */}
                  <div className="space-y-1 pt-2">
                    <div className="px-2 pt-1 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Finance & Liquidation
                    </div>

                    {/* 3. Disbursement Voucher */}
                    {isApproved && (
                      <button
                        type="button"
                        disabled={isOrgManagedEvent && isOrgLedger && !hasDisbursementVoucher}
                        onClick={() => {
                          if (isOrgManagedEvent && isOrgLedger && !hasDisbursementVoucher) {
                            toast.info('Organization Ledger Funded: No school disbursement voucher is required.');
                            return;
                          }
                          setIsUtilsOpen(false);
                          setIsDisbursementVoucherModalOpen(true);
                        }}
                        className={`w-full text-left p-2.5 rounded-xl flex items-center justify-between gap-3 transition-colors ${
                          isOrgManagedEvent && isOrgLedger && !hasDisbursementVoucher
                            ? 'opacity-60 cursor-not-allowed hover:bg-gray-50'
                            : 'hover:bg-blue-50/60 cursor-pointer active:scale-[0.99]'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                            hasDisbursementVoucher
                              ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                              : isOrgLedger
                              ? 'bg-blue-50 text-[#0E4EBD] border border-blue-200'
                              : isVoucherRequired
                              ? 'bg-amber-50 text-amber-600 border border-amber-200'
                              : 'bg-gray-100 text-gray-600 border border-gray-200'
                          }`}>
                            {hasDisbursementVoucher ? (
                              <CheckCircle2 className="w-4 h-4" />
                            ) : isOrgLedger ? (
                              <FileText className="w-4 h-4" />
                            ) : isVoucherRequired ? (
                              <FileCheck className="w-4 h-4" />
                            ) : (
                              <FileText className="w-4 h-4" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-gray-900 truncate">
                              {hasDisbursementVoucher
                                ? (isOrgManagedEvent ? (isOrgLedger ? 'View Org Receipt' : 'View Voucher') : (isOrgLedger ? 'Org Receipt (Attached)' : 'Disbursement Voucher'))
                                : (isOrgLedger ? 'Organization Treasury Slip' : 'Disbursement Voucher')}
                            </div>
                            <div className="text-[11px] text-gray-500 truncate">
                              {hasDisbursementVoucher
                                ? 'Official voucher/slip attached'
                                : isOrgManagedEvent && isOrgLedger
                                ? 'Exempt • Club treasury funds'
                                : isVoucherRequired
                                ? 'Required from school accounting'
                                : 'Optional acknowledgment copy'}
                            </div>
                          </div>
                        </div>
                        <div className="shrink-0">
                          {hasDisbursementVoucher ? (
                            <span className="text-[10px] font-bold uppercase font-mono px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Attached
                            </span>
                          ) : isOrgManagedEvent && isOrgLedger ? (
                            <span className="text-[10px] font-bold uppercase font-mono px-2 py-0.5 rounded-full bg-blue-50 text-[#0E4EBD] border border-blue-200">
                              Exempt
                            </span>
                          ) : isVoucherRequired ? (
                            <span className="text-[10px] font-bold uppercase font-mono px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                              Required
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold uppercase font-mono px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200">
                              Optional
                            </span>
                          )}
                        </div>
                      </button>
                    )}

                    {/* 4. Cash Custodians & Liquidation */}
                    <button
                      type="button"
                      disabled={!isApproved || (isVoucherRequired && !hasDisbursementVoucher)}
                      onClick={() => {
                        if (!isApproved) {
                          toast.error('Locked: Proposal must be approved before allocating cash advance amounts.');
                          return;
                        }
                        if (isVoucherRequired && !hasDisbursementVoucher) {
                          toast.error('Locked: Official Disbursement Voucher must be uploaded first before allocating cash advance amounts.');
                          return;
                        }
                        setIsUtilsOpen(false);
                        setIsCashModalOpen(true);
                      }}
                      className={`w-full text-left p-2.5 rounded-xl flex items-center justify-between gap-3 transition-colors ${
                        !isApproved || (isVoucherRequired && !hasDisbursementVoucher)
                          ? 'opacity-60 cursor-not-allowed hover:bg-gray-50'
                          : 'hover:bg-blue-50/60 cursor-pointer active:scale-[0.99]'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          !isApproved || (isVoucherRequired && !hasDisbursementVoucher)
                            ? 'bg-amber-50 text-amber-600 border border-amber-200'
                            : 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                        }`}>
                          {!isApproved || (isVoucherRequired && !hasDisbursementVoucher) ? (
                            <Lock className="w-4 h-4" />
                          ) : (
                            <Coins className="w-4 h-4" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-gray-900 truncate">
                            {isOrgManagedEvent ? 'Cash Custodians (View Only)' : 'Cash Custodians & Liquidation'}
                          </div>
                          <div className="text-[11px] text-gray-500 truncate">
                            {isLiquidationExempt
                              ? 'Non-monetary (₱0) • Exempt'
                              : !isApproved
                              ? 'Locked: Approval required'
                              : (isVoucherRequired && !hasDisbursementVoucher)
                              ? 'Locked: Voucher needed first'
                              : 'Manage cash advances & liquidation'}
                          </div>
                        </div>
                      </div>
                      <div className="shrink-0">
                        {isLiquidationExempt ? (
                          <span className="text-[10px] font-bold uppercase font-mono px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Exempt (₱0)
                          </span>
                        ) : !isApproved ? (
                          <span className="text-[10px] font-bold uppercase font-mono px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                            Locked
                          </span>
                        ) : (isVoucherRequired && !hasDisbursementVoucher) ? (
                          <span className="text-[10px] font-bold uppercase font-mono px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                            Voucher Needed
                          </span>
                        ) : isOrgManagedEvent ? (
                          <span className="text-[10px] font-bold uppercase font-mono px-2 py-0.5 rounded-full bg-blue-50 text-[#0E4EBD] border border-blue-200">
                            Club
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold uppercase font-mono px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Open
                          </span>
                        )}
                      </div>
                    </button>
                  </div>

                  {/* Section 3: Proposal Revisions (if hasRevisions) */}
                  {hasRevisions && (
                    <div className="space-y-1 pt-2">
                      <div className="px-2 pt-1 pb-1 text-[10px] font-bold uppercase tracking-wider text-amber-700">
                        Revisions & Audit
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setIsUtilsOpen(false);
                          setShowDiffModal(true);
                        }}
                        className="w-full text-left p-2.5 rounded-xl flex items-center justify-between gap-3 bg-amber-50/40 hover:bg-amber-50 border border-amber-200/60 transition-colors cursor-pointer active:scale-[0.99]"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 border border-amber-300 flex items-center justify-center shrink-0">
                            <GitCompare className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-gray-900 truncate">Compare Proposal Revisions</div>
                            <div className="text-[11px] text-amber-800 truncate">
                              {proposalDiffs.length} field revision(s) recorded
                            </div>
                          </div>
                        </div>
                        <span className="shrink-0 text-[10px] font-bold uppercase font-mono px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 border border-amber-300">
                          {proposalDiffs.length} Diff(s)
                        </span>
                      </button>
                    </div>
                  )}

                  {/* Section 4: Lifecycle & Actions */}
                  {((event.proposalStatus === 'approved' && event.status !== 'completed' && !event.isArchived && !isOrgManagedEvent) ||
                    ((event.status === 'completed' || event.proposalStatus === 'completed' || timing === 'completed') && !event.isArchived && !isOrgManagedEvent) ||
                    (!isCancelled && cancelCheck.canCancel) ||
                    event.isArchived) && (
                    <div className="space-y-1 pt-2">
                      <div className="px-2 pt-1 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Lifecycle & Actions
                      </div>

                      {/* Conclude Action */}
                      {event.proposalStatus === 'approved' && event.status !== 'completed' && !event.isArchived && !isOrgManagedEvent && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsUtilsOpen(false);
                            setShowConcludeModal(true);
                          }}
                          className="w-full text-left p-2.5 rounded-xl flex items-center justify-between gap-3 hover:bg-emerald-50 text-emerald-900 border border-transparent hover:border-emerald-200 transition-colors cursor-pointer"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center shrink-0">
                              <CheckCircle2 className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold truncate">Conclude Activity</div>
                              <div className="text-[11px] text-emerald-600 truncate">Mark completed & finalize attendance</div>
                            </div>
                          </div>
                          <span className="shrink-0 text-[10px] font-bold uppercase font-mono px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                            Finish
                          </span>
                        </button>
                      )}

                      {/* Archive Action */}
                      {(event.status === 'completed' || event.proposalStatus === 'completed' || timing === 'completed') && !event.isArchived && !isOrgManagedEvent && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsUtilsOpen(false);
                            setShowArchiveModal(true);
                          }}
                          className="w-full text-left p-2.5 rounded-xl flex items-center justify-between gap-3 hover:bg-indigo-50 text-indigo-900 border border-transparent hover:border-indigo-200 transition-colors cursor-pointer"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-200 flex items-center justify-center shrink-0">
                              <FolderArchive className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold truncate">Archive Activity</div>
                              <div className="text-[11px] text-indigo-600 truncate">Move to historical archives</div>
                            </div>
                          </div>
                          <span className="shrink-0 text-[10px] font-bold uppercase font-mono px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200">
                            Archive
                          </span>
                        </button>
                      )}

                      {/* Cancel Action */}
                      {!isCancelled && cancelCheck.canCancel && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsUtilsOpen(false);
                            setShowCancelModal(true);
                          }}
                          className="w-full text-left p-2.5 rounded-xl flex items-center justify-between gap-3 hover:bg-rose-50 text-rose-900 border border-transparent hover:border-rose-200 transition-colors cursor-pointer"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 border border-rose-200 flex items-center justify-center shrink-0">
                              <AlertTriangle className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold truncate">Cancel Activity</div>
                              <div className="text-[11px] text-rose-600 truncate">Cancel event with justification</div>
                            </div>
                          </div>
                          <span className="shrink-0 text-[10px] font-bold uppercase font-mono px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200">
                            Cancel
                          </span>
                        </button>
                      )}

                      {/* Delete Action */}
                      {event.isArchived && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsUtilsOpen(false);
                            setShowDeleteModal(true);
                          }}
                          className="w-full text-left p-2.5 rounded-xl flex items-center justify-between gap-3 hover:bg-red-50 text-red-900 border border-transparent hover:border-red-200 transition-colors cursor-pointer"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-red-50 text-red-600 border border-red-200 flex items-center justify-center shrink-0">
                              <Trash2 className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold truncate">Delete Permanently</div>
                              <div className="text-[11px] text-red-600 truncate">Purge archived record</div>
                            </div>
                          </div>
                          <span className="shrink-0 text-[10px] font-bold uppercase font-mono px-2 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-200">
                            Delete
                          </span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main 3-Pane Layout */}
      <div className="flex flex-1 min-h-0">
        {/* Left Sidebar: Section Navigator */}
        <aside className="w-64 lg:w-72 flex-shrink-0 border-r border-gray-200 bg-gray-50/70 flex flex-col overflow-y-auto p-4 space-y-6">
          {/* Organization / Issuer Badge */}
          <div className="p-3.5 bg-white border border-gray-200 rounded-xl shadow-xs">
            <div className="flex items-center gap-2.5">
              {isSas ? (
                <div className="w-9 h-9 rounded-lg bg-[#001A4D] flex items-center justify-center text-[#FFD41C] font-bold text-xs shadow-xs">
                  SAS
                </div>
              ) : orgLogo ? (
                <img
                  src={orgLogo}
                  alt={orgAcronym}
                  className="w-9 h-9 rounded-lg object-cover border border-blue-200 shadow-xs"
                />
              ) : (
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#001A4D] to-[#0E4EBD] flex items-center justify-center text-white font-bold text-xs shadow-xs">
                  {orgAcronym.slice(0, 3)}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-gray-900 truncate">{orgName}</p>
                <p className="text-[11px] text-gray-500 truncate">
                  Submitted by: {event.createdByName || 'Officer'}
                </p>
                {fullProposal.submissionDate && (
                  <p className="text-[10px] text-gray-400 font-mono mt-0.5">
                    Date: {fullProposal.submissionDate}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Section Navigation List (10 Official Form AP-01 Sections) */}
          <div className="space-y-1">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider px-3 mb-2">
              Proposal Sections (Form AP-01)
            </p>
            {navItems.map((sec) => {
              const Icon = sec.icon;
              const isActive = activeSection === sec.id;

              return (
                <button
                  key={sec.id}
                  onClick={() => scrollTo(sec.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-all text-left relative cursor-pointer ${isActive
                      ? 'bg-blue-50/80 text-[#0E4EBD] shadow-xs'
                      : 'text-gray-600 hover:bg-gray-100/80 hover:text-gray-900'
                    }`}
                >
                  {isActive && (
                    <div className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-[#0E4EBD] rounded-r-full" />
                  )}
                  <Icon
                    className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-[#0E4EBD]' : 'text-gray-400'
                      }`}
                  />
                  <span className="flex-1 truncate">{sec.label}</span>
                </button>
              );
            })}
          </div>

          {/* Review Progress (For pending proposals) */}
          {!isApproved && !isCancelled && (
            <div className="bg-white border border-gray-200 rounded-xl p-3.5 shadow-xs">
              <div className="flex items-center gap-2 mb-2.5">
                <CheckCircle className="w-4 h-4 text-[#0E4EBD]" />
                <span className="text-[#001A4D] font-bold text-xs">Review Progress</span>
              </div>
              <div className="space-y-2">
                {[
                  { label: 'Viewed all 10 sections', done: allVisited },
                  { label: 'Remarks entered', done: remarksWritten },
                  { label: 'Decision chosen', done: decision !== 'none' },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-2">
                    <div
                      className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center flex-shrink-0 transition-colors ${item.done ? 'bg-[#0E4EBD] border-[#0E4EBD]' : 'border-gray-300'
                        }`}
                    >
                      {item.done && <Check className="w-2 h-2 text-white" />}
                    </div>
                    <span className={`text-[11px] ${item.done ? 'text-[#001A4D] font-semibold' : 'text-gray-500'}`}>
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick Notice Card */}
          <div className="p-3.5 bg-gradient-to-br from-[#001A4D] to-[#0E4EBD] rounded-xl text-white text-xs space-y-2 mt-auto shadow-xs">
            <div className="flex items-center gap-1.5 text-[#FFD41C] font-bold">
              <Shield className="w-3.5 h-3.5" />
              <span>Admin Oversight</span>
            </div>
            <p className="text-[11px] text-white/80 leading-relaxed">
              Official Form AP-01 institutional record. Approvals release operational controls, student publishing, and budget allocations.
            </p>
          </div>
        </aside>

        {/* Center Column: 10 Form AP-01 Proposal Sections */}
        <main ref={centerRef} className="flex-1 overflow-y-auto bg-gray-50/30 p-6 lg:p-8 space-y-8">
          {isCancelled ? (
            <div className="p-5 rounded-2xl bg-gradient-to-r from-red-50 to-rose-50 border-2 border-red-200 shadow-xs flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0 text-red-600">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-red-900 text-base">This Activity has been Cancelled</h3>
                <p className="text-sm text-red-800 mt-1">
                  <span className="font-semibold text-red-900">Reason:</span> {event.cancellationReason || 'No reason specified'}
                </p>
                <div className="text-xs text-red-600 mt-2 flex flex-wrap items-center gap-3">
                  <span>Cancelled by: <strong className="text-red-700">{event.cancelledBy || 'Administrator'}</strong></span>
                  {event.cancelledAt && <span>• {formatAppDateTime(event.cancelledAt)}</span>}
                </div>
              </div>
            </div>
          ) : !isCompleted && !isApproved && (event.proposalStatus === 'rejected' || event.proposalStatus === 'returned') ? (
            <div className={`p-4 rounded-xl border-l-4 ${event.proposalStatus === 'rejected' ? 'bg-red-50 border-red-500' : 'bg-amber-50 border-amber-500'}`}>
              <p className="text-sm font-bold text-gray-800">
                {event.proposalStatus === 'rejected'
                  ? `This proposal was Rejected on ${formatAppDate(event.rejectedAt, 'N/A')}. Reason: ${event.rejectionReason || 'No reason specified'}`
                  : `This proposal was Returned for Revision on ${formatAppDate(event.returnedAt, 'N/A')}.`}
              </p>
            </div>
          ) : null}

          {/* SECTION 1 — ACTIVITY OVERVIEW */}
          <section
            ref={(el) => { sectionRefs.current['overview'] = el; }}
            onMouseEnter={() => { setActiveSection('overview'); setVisitedSections((p) => new Set([...p, 'overview'])); }}
            className="space-y-4"
          >
            <SectionHeader
              title="1. Activity Identity & Proponents"
              subtitle="Official Form AP-01 title, theme, host bodies, principal proponents, and media assets"
            />

            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xs">
              {event.bannerImageUrl ? (
                <div className="h-56 sm:h-72 w-full overflow-hidden bg-slate-900 relative">
                  <img
                    src={event.bannerImageUrl}
                    alt={event.title || 'Activity Banner'}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/10" />
                  <div className="absolute bottom-3 left-3 text-white flex items-center gap-2">
                    <span className="px-3 py-1 bg-black/60 backdrop-blur-md rounded-full text-xs font-bold border border-white/20">
                      Promotional Banner
                    </span>
                    <span className="px-3 py-1 bg-[#0E4EBD]/80 backdrop-blur-md rounded-full text-xs font-bold border border-white/20">
                      {eventTypeName}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="h-40 bg-gradient-to-br from-[#001A4D] via-[#002B7F] to-[#0E4EBD] flex items-center justify-center">
                  <div className="text-center">
                    <FileImage className="w-10 h-10 text-white/40 mx-auto mb-2" />
                    <p className="text-white/60 text-xs">No banner uploaded yet (can be added via Operational Studio once approved)</p>
                  </div>
                </div>
              )}

              <div className="p-6 space-y-6">
                {/* Title Banner */}
                <div className="p-4 bg-gradient-to-r from-blue-50/80 via-white to-amber-50/40 rounded-xl border-l-4 border-[#0E4EBD] shadow-xs">
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[#0E4EBD]">
                        Official Activity Title
                      </span>
                      {diffByPath.get('title') && (
                        <InlineRevisionBadge diff={diffByPath.get('title')} />
                      )}
                    </div>
                    <span className="text-xs font-mono font-bold px-2.5 py-0.5 bg-[#FFD41C] text-[#001A4D] rounded-md">
                      {fullProposal.referenceNo || event.referenceId || 'AP-2026-REF'}
                    </span>
                  </div>
                  <h1 className="text-2xl font-extrabold text-[#001A4D] tracking-tight">
                    {fullProposal.title || event.title}
                  </h1>
                  {event.tagline && (
                    <p className="text-sm font-semibold text-[#0E4EBD] mt-1 italic">
                      "{event.tagline}"
                    </p>
                  )}
                </div>

                {/* Proponents & Organizers Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Proponents */}
                  <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <UserCheck className="w-4 h-4 text-[#0E4EBD]" />
                      <span className="text-xs uppercase font-bold text-slate-700 tracking-wider">
                        Principal Proponent(s) / Co-Makers
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {proponentsList.map((proponent, idx) => (
                        <span
                          key={idx}
                          className="px-3 py-1 bg-white border border-slate-300 text-[#001A4D] font-bold text-xs rounded-lg shadow-2xs"
                        >
                          {proponent}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Organizing Bodies */}
                  <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-[#0E4EBD]" />
                      <span className="text-xs uppercase font-bold text-slate-700 tracking-wider">
                        Organizing Body / Host
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {organizersList.map((orgItem, idx) => (
                        <span
                          key={idx}
                          className="px-3 py-1 bg-[#001A4D] text-[#FFD41C] font-bold text-xs rounded-lg shadow-2xs"
                        >
                          {orgItem}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Description Narrative */}
                <div>
                  <p className="text-xs uppercase text-gray-400 font-bold mb-1.5">Activity Narrative & Description</p>
                  <p className="text-gray-800 text-sm leading-relaxed whitespace-pre-wrap bg-gray-50/80 p-4 rounded-xl border border-gray-100">
                    {fullProposal.description || event.description || 'No description provided.'}
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* SECTION 2 — OBJECTIVES & SUCCESS INDICATORS */}
          <section
            ref={(el) => { sectionRefs.current['objectives'] = el; }}
            onMouseEnter={() => { setActiveSection('objectives'); setVisitedSections((p) => new Set([...p, 'objectives'])); }}
            className="space-y-4"
          >
            <SectionHeader
              title="2. Institutional Objectives & Success Indicators"
              subtitle="Form AP-01 strategic alignment, core objectives, and measurable Key Performance Indicators (KPIs)"
            />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Objectives */}
              <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs space-y-3">
                <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                  <Target className="w-4 h-4 text-[#0E4EBD]" />
                  <h4 className="text-sm font-bold text-[#001A4D]">Activity Objectives</h4>
                  <span className="ml-auto text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                    {objectivesList.length} Defined
                  </span>
                </div>
                {objectivesList.length > 0 ? (
                  <div className="space-y-2.5">
                    {objectivesList.map((obj, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 bg-blue-50/50 rounded-xl border border-blue-100/60">
                        <div className="w-5 h-5 bg-[#0E4EBD] text-white rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                          {i + 1}
                        </div>
                        <p className="text-[#001A4D] text-xs leading-relaxed font-medium">{obj}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic py-4 text-center">No specific objectives defined.</p>
                )}
              </div>

              {/* Success Indicators */}
              <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs space-y-3">
                <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                  <TrendingUp className="w-4 h-4 text-emerald-600" />
                  <h4 className="text-sm font-bold text-[#001A4D]">Measurable KPIs & Success Indicators</h4>
                  <span className="ml-auto text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                    {successIndicatorsList.length} Targets
                  </span>
                </div>
                {successIndicatorsList.length > 0 ? (
                  <div className="space-y-2.5">
                    {successIndicatorsList.map((ind, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 bg-emerald-50/50 rounded-xl border border-emerald-100/60">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                        <p className="text-emerald-950 text-xs leading-relaxed font-medium">{ind}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic py-4 text-center">
                    No measurable success indicators defined yet.
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* SECTION 3 — OPERATIONAL UTILS & BUDGET CUSTODIANS */}
          <section
            ref={(el) => { sectionRefs.current['operations'] = el; }}
            onMouseEnter={() => { setActiveSection('operations'); setVisitedSections((p) => new Set([...p, 'operations'])); }}
            className="space-y-4"
          >
            <SectionHeader
              title="3. Operational Setup & Budget Custodians"
              subtitle="Post-approval controls: Promotional banner, student publishing, attendance scanners, and dynamic cash allocations ('Hold Money')"
            />

            {isApproved ? (
              <div className="bg-white border border-blue-200 rounded-2xl p-6 shadow-xs space-y-5">
                {isOrgManagedEvent && (
                  <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 flex items-center gap-2.5 text-xs text-amber-950">
                    <Shield className="w-4 h-4 text-amber-600 flex-shrink-0" />
                    <span>
                      <strong>Organization-Controlled Utilities (Admin Read-Only):</strong> Operational controls (mobile feed publishing, QR attendance scanners, and cash advance allocations) are managed exclusively by designated student organization officers. Administrative view is strictly read-only.
                    </span>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        isOrgManagedEvent
                          ? 'bg-amber-100 text-amber-900 border border-amber-200'
                          : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      }`}>
                        {isOrgManagedEvent ? 'Club Managed • Read-Only' : 'Operational Controls Unlocked'}
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-slate-900 mt-1">
                      Financial Liquidation &amp; Activity Operations
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {isOrgManagedEvent
                        ? 'View promotional mobile banners, ticket scanners, and actual expense liquidations submitted by student officers.'
                        : 'Configure mobile app publishing, manage ticket scanners, and liquidate actual expenditures with official receipts.'}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {isAlreadyPublished ? (
                      <button
                        type="button"
                        disabled
                        className="px-3 py-2 bg-emerald-950/40 text-emerald-300 border border-emerald-500/30 text-xs font-bold rounded-xl shadow-xs inline-flex items-center gap-1.5 cursor-not-allowed select-none"
                        title="Activity is already published and live on the student mobile app"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Already Published</span>
                        <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          Live
                        </span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setIsPublishModalOpen(true)}
                        className={`px-3 py-2 text-white text-xs font-bold rounded-xl shadow-xs inline-flex items-center gap-1.5 transition-all cursor-pointer ${
                          isOrgManagedEvent ? 'bg-slate-800 hover:bg-slate-900' : 'bg-blue-600 hover:bg-blue-700'
                        }`}
                      >
                        {isOrgManagedEvent ? <Eye className="w-3.5 h-3.5 text-sky-300" /> : <Smartphone className="w-3.5 h-3.5 text-sky-200" />}
                        <span>{isOrgManagedEvent ? 'View Publishing & Banner' : 'Publishing & Banner'}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={!isAlreadyPublished}
                      onClick={() => {
                        if (!isAlreadyPublished) {
                          toast.error('Locked: Activity must be published to the mobile app first before configuring attendance & scanners.');
                          return;
                        }
                        setIsAttendanceModalOpen(true);
                      }}
                      className={`px-3 py-2 text-white text-xs font-bold rounded-xl shadow-xs inline-flex items-center gap-1.5 transition-all ${
                        !isAlreadyPublished
                          ? 'bg-slate-300 text-slate-500 cursor-not-allowed select-none'
                          : isOrgManagedEvent
                          ? 'bg-slate-800 hover:bg-slate-900 cursor-pointer'
                          : 'bg-indigo-600 hover:bg-indigo-700 cursor-pointer'
                      }`}
                    >
                      {!isAlreadyPublished ? (
                        <>
                          <Lock className="w-3.5 h-3.5 text-slate-500" />
                          <span>Attendance & Scanners (Locked)</span>
                        </>
                      ) : isOrgManagedEvent ? (
                        <>
                          <Eye className="w-3.5 h-3.5 text-indigo-300" />
                          <span>View Attendance & Scanners</span>
                        </>
                      ) : (
                        <>
                          <QrCode className="w-3.5 h-3.5 text-indigo-200" />
                          <span>Attendance & Scanners</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={isVoucherRequired && !hasDisbursementVoucher}
                      onClick={() => {
                        if (isVoucherRequired && !hasDisbursementVoucher) {
                          toast.error('Locked: Official Disbursement Voucher must be uploaded first before allocating cash custodians.');
                          return;
                        }
                        setIsCashModalOpen(true);
                      }}
                      className={`px-3 py-2 text-xs font-bold rounded-xl shadow-xs inline-flex items-center gap-1.5 transition-all ${
                        isVoucherRequired && !hasDisbursementVoucher
                          ? 'bg-slate-200 text-slate-500 cursor-not-allowed select-none'
                          : isOrgManagedEvent ? 'bg-slate-800 hover:bg-slate-900 text-[#FFD41C] cursor-pointer' : 'bg-[#001A4D] hover:bg-[#002D72] text-[#FFD41C] cursor-pointer'
                      }`}
                    >
                      {isVoucherRequired && !hasDisbursementVoucher ? (
                        <>
                          <Lock className="w-3.5 h-3.5 text-slate-400" />
                          <span>Custodians (Voucher Required)</span>
                        </>
                      ) : isLiquidationExempt ? (
                        <>
                          <Coins className="w-3.5 h-3.5 text-emerald-300" />
                          <span>Custodians (Exempt - ₱0)</span>
                        </>
                      ) : isOrgManagedEvent ? (
                        <>
                          <Eye className="w-3.5 h-3.5 text-[#FFD41C]" />
                          <span>View Budget Custodians</span>
                        </>
                      ) : (
                        <>
                          <Coins className="w-3.5 h-3.5 text-[#FFD41C]" />
                          <span>Allocate Cash Custodians</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                
                {/* Disbursement Voucher Status Banner */}
                {hasDisbursementVoucher ? (
                  <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-emerald-950">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                        <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                      </div>
                      <div>
                        <span className="font-bold flex items-center gap-2">
                          {isOrgLedger ? 'Organization Disbursement Receipt Attached' : 'Official Disbursement Voucher Verified'}
                          <span className="text-[10px] font-mono px-2 py-0.2 rounded-full bg-emerald-200/80 text-emerald-900 border border-emerald-300">
                            Attached
                          </span>
                        </span>
                        <p className="text-[11px] text-emerald-800 mt-0.5 font-mono">
                          Check #{currentDisbursementVoucher.chequeNumber || 'N/A'} • Released: {currentDisbursementVoucher.disbursementDate || 'N/A'} • ₱{formatPHP(currentDisbursementVoucher.amountDisbursed || 0)}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsDisbursementVoucherModalOpen(true)}
                      className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl text-xs inline-flex items-center justify-center gap-1.5 transition-all cursor-pointer shrink-0"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>{isOrgManagedEvent ? 'View Attached Voucher' : 'View / Update Voucher'}</span>
                    </button>
                  </div>
                ) : isOrgLedger ? (
                  <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-800">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-blue-100 text-[#0E4EBD] flex items-center justify-center shrink-0">
                        <Building2 className="w-4 h-4 text-[#0E4EBD]" />
                      </div>
                      <div>
                        <span className="font-bold flex items-center gap-2 text-[#001A4D]">
                          Organization Treasury Funded
                          <span className="text-[10px] font-mono px-2 py-0.2 rounded-full bg-blue-100 text-[#0E4EBD] border border-blue-200">
                            No School Voucher Needed
                          </span>
                        </span>
                        <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
                          This activity's budget is drawn directly from the organization's own treasury funds. An institutional school disbursement voucher from accounting is not required; cash custodians can be allocated and liquidated directly.
                        </p>
                      </div>
                    </div>
                    {!isOrgManagedEvent && (
                      <button
                        type="button"
                        onClick={() => setIsDisbursementVoucherModalOpen(true)}
                        className="px-3 py-1.5 bg-[#0E4EBD] hover:bg-[#00246B] text-white font-bold rounded-xl text-xs inline-flex items-center justify-center gap-1.5 transition-all cursor-pointer shrink-0"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>Attach Org Slip (Optional)</span>
                      </button>
                    )}
                  </div>
                ) : isZeroBudget ? (
                  <div className="p-3.5 bg-emerald-50/80 border border-emerald-200 rounded-2xl flex items-center gap-2.5 text-xs text-emerald-950">
                    <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                    </div>
                    <div>
                      <span className="font-bold flex items-center gap-2 text-emerald-950">
                        Non-Monetary Activity (₱0.00 Budget)
                        <span className="text-[10px] font-mono px-2 py-0.2 rounded-full bg-emerald-200 text-emerald-900 border border-emerald-300">
                          Zero Budget
                        </span>
                      </span>
                      <p className="text-[11px] text-emerald-800 mt-0.5">
                        This activity has no monetary budget allocation. No disbursement voucher or cash advance allocation is required.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-950">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                        <AlertTriangle className="w-4 h-4 text-amber-700" />
                      </div>
                      <div>
                        <span className="font-bold flex items-center gap-2 text-amber-900">
                          Disbursement Voucher Required
                          <span className="text-[10px] font-mono px-2 py-0.2 rounded-full bg-amber-200 text-amber-800 border border-amber-300">
                            {isOrgManagedEvent ? 'Club Managed' : 'Locked'}
                          </span>
                        </span>
                        <p className="text-[11px] text-amber-800 mt-0.5">
                          {isOrgManagedEvent
                            ? 'The official check release slip or bank voucher must be uploaded by the organization adviser or officers before physical funds are distributed.'
                            : 'Upload the official check release slip or bank voucher before cash advances can be distributed and financial liquidation can begin.'}
                        </p>
                      </div>
                    </div>
                    {isOrgManagedEvent ? (
                      <button
                        type="button"
                        onClick={() => setIsDisbursementVoucherModalOpen(true)}
                        className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-900 text-sky-200 font-bold rounded-xl text-xs inline-flex items-center justify-center gap-1.5 transition-all cursor-pointer shrink-0 shadow-xs"
                      >
                        <Eye className="w-3.5 h-3.5 text-sky-300" />
                        <span>View Voucher Status</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setIsDisbursementVoucherModalOpen(true)}
                        className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs inline-flex items-center justify-center gap-1.5 transition-all cursor-pointer shrink-0 shadow-xs"
                      >
                        <FileCheck className="w-3.5 h-3.5 text-[#FFD41C]" />
                        <span>Upload Disbursement Voucher</span>
                      </button>
                    )}
                  </div>
                )}

                {/* Financial Liquidation Baseline & Status Card */}
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                      <Receipt className="w-3.5 h-3.5 text-[#0E4EBD]" />
                      Financial Liquidation (Form LF-01 Readiness)
                    </span>
                    <span className="font-mono text-slate-600">
                      Approved Baseline Budget Ceiling: <strong className="text-[#001A4D]">{formatPHP(totalExpenseAmount)}</strong>
                    </span>
                  </div>

                  {isLiquidationExempt ? (
                    <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-emerald-950">
                            Non-Monetary Activity — No Financial Liquidation Required
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                            Liquidation Exempt
                          </span>
                        </div>
                        <p className="text-xs text-emerald-800 max-w-xl">
                          This activity has no budget and no monetary expense projections. Financial liquidation (Form LF-01) is not required for clearance, compliance, or archiving.
                        </p>
                      </div>

                      <div className="px-3.5 py-2 bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shrink-0">
                        <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                        <span>Liquidation Exempt (₱0)</span>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 bg-gradient-to-br from-blue-50/70 via-white to-slate-50 border border-blue-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-[#001A4D]">
                            Proposed Expense Baseline Guide
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-900 border border-blue-300">
                            Guidance Ceiling
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 max-w-xl">
                          The proposal budget serves as an approved spending baseline. Click <strong>"{isOrgManagedEvent ? 'View Financial Liquidation' : 'Financial Liquidation'}"</strong> to review or record actual purchases line-by-line with official receipts (ORs) and track remaining balances in real time.
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => setIsCashModalOpen(true)}
                        className="px-4 py-2.5 bg-[#001A4D] hover:bg-[#002D72] text-[#FFD41C] text-xs font-bold rounded-xl shadow-xs inline-flex items-center justify-center gap-2 transition-all cursor-pointer shrink-0"
                      >
                        <Receipt className="w-4 h-4 text-[#FFD41C]" />
                        <span>{isOrgManagedEvent ? 'View Financial Liquidation' : 'Open Financial Liquidation'}</span>
                        <ChevronRight className="w-3.5 h-3.5 text-[#FFD41C]/70" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : isOrgManagedEvent ? (
              <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-6 text-center space-y-2">
                <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center mx-auto">
                  <Lock className="w-5 h-5 text-amber-700" />
                </div>
                <h4 className="text-xs font-bold text-amber-950">
                  Organization-Controlled Operational Utilities
                </h4>
                <p className="text-xs text-amber-800 max-w-md mx-auto">
                  This activity is hosted by a student organization. Operational utilities (mobile feed publishing, ticket scanners, and budget custodians) cannot be configured or unlocked by SAS. Only designated student officers can configure them. Administrative view is read-only.
                </p>
              </div>
            ) : (
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 text-center space-y-2">
                <div className="w-10 h-10 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center mx-auto">
                  <Lock className="w-5 h-5" />
                </div>
                <h4 className="text-xs font-bold text-slate-800">
                  Operational Studio & Cash Disbursals Locked
                </h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Promotional banners, student app publishing, attendance scanners, and budget custodian allocations unlock automatically once the proposal is fully approved.
                </p>
              </div>
            )}
          </section>

          {/* SECTION 4 — MECHANICS & MATERIALS */}
          <section
            ref={(el) => { sectionRefs.current['execution'] = el; }}
            onMouseEnter={() => { setActiveSection('execution'); setVisitedSections((p) => new Set([...p, 'execution'])); }}
            className="space-y-4"
          >
            <SectionHeader
              title="4. Activity Mechanics & Required Materials"
              subtitle="Step-by-step procedural mechanics and physical / technical equipment inventory"
            />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Step-by-Step Mechanics */}
              <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs space-y-3">
                <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                  <Wrench className="w-4 h-4 text-[#0E4EBD]" />
                  <h4 className="text-sm font-bold text-[#001A4D]">Step-by-Step Activity Mechanics</h4>
                  <span className="ml-auto text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                    {mechanicsList.length} Steps
                  </span>
                </div>
                {mechanicsList.length > 0 ? (
                  <div className="space-y-3">
                    {mechanicsList.map((mech, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 bg-gray-50/80 rounded-xl border border-gray-200/60">
                        <div className="w-6 h-6 bg-[#001A4D] text-[#FFD41C] rounded-lg flex items-center justify-center text-xs font-black flex-shrink-0">
                          {i + 1}
                        </div>
                        <p className="text-gray-800 text-xs leading-relaxed font-medium">{mech}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic py-4 text-center">No step mechanics defined.</p>
                )}
              </div>

              {/* Required Materials */}
              <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs space-y-3">
                <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                  <Coins className="w-4 h-4 text-amber-600" />
                  <h4 className="text-sm font-bold text-[#001A4D]">Required Materials & Equipment</h4>
                  <span className="ml-auto text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                    {materialsList.length} Items
                  </span>
                </div>
                {materialsList.length > 0 ? (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {materialsList.map((mat, i) => (
                      <span
                        key={i}
                        className="px-3 py-1.5 bg-amber-50 text-amber-900 border border-amber-200/80 rounded-xl text-xs font-semibold"
                      >
                        • {mat}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic py-4 text-center">No specific materials listed.</p>
                )}
              </div>
            </div>
          </section>

          {/* SECTION 5 — SCHEDULE & TARGET AUDIENCE */}
          <section
            ref={(el) => { sectionRefs.current['audience_schedule'] = el; }}
            onMouseEnter={() => { setActiveSection('audience_schedule'); setVisitedSections((p) => new Set([...p, 'audience_schedule'])); }}
            className="space-y-4"
          >
            <SectionHeader
              title="5. Target Audience & Multi-Session Schedule"
              subtitle="Academic criteria, participant count, and session schedules with entry/exit scanning windows"
            />

            <div className="space-y-4">
              {/* Audience Scope Summary */}
              <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-gray-100 pb-3 border-b border-gray-100">
                  <div className="px-3 first:pl-0 text-left sm:text-center">
                    <p className="text-[11px] uppercase text-gray-400 font-bold tracking-wider mb-1">Expected Attendance</p>
                    <p className="text-[#001A4D] font-extrabold text-base">
                      {fullProposal.estimatedAttendance || `${event.expectedParticipantCount || 0} Students`}
                    </p>
                  </div>
                  <div className="px-3 text-left sm:text-center pt-3 sm:pt-0">
                    <p className="text-[11px] uppercase text-gray-400 font-bold tracking-wider mb-1">Academic Division</p>
                    <p className="text-[#0E4EBD] font-extrabold text-sm">
                      {event.targetAcademicLevel === 'COLLEGE'
                        ? 'College Division'
                        : event.targetAcademicLevel === 'SHS'
                          ? 'Senior High School (SHS)'
                          : 'Both College & SHS'}
                    </p>
                  </div>
                  <div className="px-3 last:pr-0 text-left sm:text-center pt-3 sm:pt-0">
                    <p className="text-[11px] uppercase text-gray-400 font-bold tracking-wider mb-1">Audience Scope</p>
                    <p className="text-slate-800 font-extrabold text-sm">
                      {event.targetAudienceScope === 'members' ? 'Org Members Only' : 'Campus-Wide Open'}
                    </p>
                  </div>
                </div>

                {/* Filter Badges: Years, Programs, Sections */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <p className="text-[10px] uppercase font-bold text-slate-400 mb-1.5">Target Year Levels</p>
                    <div className="flex flex-wrap gap-1">
                      {(event.targetYearLevels || []).map((y) => (
                        <span key={y} className="px-2 py-0.5 bg-[#001A4D] text-[#FFD41C] text-[10px] font-bold rounded-md">
                          {y}
                        </span>
                      ))}
                      {(!event.targetYearLevels || event.targetYearLevels.length === 0) && (
                        <span className="text-slate-400 italic text-[11px]">All Year Levels</span>
                      )}
                    </div>
                  </div>

                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <p className="text-[10px] uppercase font-bold text-slate-400 mb-1.5">Programs / Strands</p>
                    <div className="flex flex-wrap gap-1">
                      {targetCourseLabels.map((c, i) => (
                        <span key={i} className="px-2 py-0.5 bg-indigo-50 text-indigo-800 text-[10px] font-semibold rounded-md border border-indigo-200">
                          {c}
                        </span>
                      ))}
                      {targetCourseLabels.length === 0 && (
                        <span className="text-slate-400 italic text-[11px]">All Programs</span>
                      )}
                    </div>
                  </div>

                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <p className="text-[10px] uppercase font-bold text-slate-400 mb-1.5">Target Sections</p>
                    <div className="flex flex-wrap gap-1">
                      {targetSectionLabels.map((s, i) => (
                        <span key={i} className="px-2 py-0.5 bg-purple-50 text-[#83358E] text-[10px] font-semibold rounded-md border border-purple-200">
                          {s}
                        </span>
                      ))}
                      {targetSectionLabels.length === 0 && (
                        <span className="text-slate-400 italic text-[11px]">All Sections</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Sessions List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-[#001A4D]">
                    Activity Sessions ({event.sessions?.length || 1})
                  </h4>
                  <span className="text-xs text-gray-500">
                    Requested Venue: <strong className="text-[#001A4D]">{venueName}</strong>
                  </span>
                </div>

                {(event.sessions || []).map((s, i) => (
                  <div key={s.id || i} className="border-l-4 border-[#0E4EBD] bg-white border border-gray-200 rounded-xl p-4 shadow-xs space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-2 border-b border-gray-100">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-[#0E4EBD]/10 text-[#0E4EBD] font-black text-xs uppercase tracking-wider rounded-md">
                          Session {i + 1}
                        </span>
                        <span className="text-[#001A4D] font-extrabold text-base">{s.title || `Session ${i + 1}`}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-gray-700 font-semibold bg-gray-50 px-2.5 py-1 rounded-lg border border-gray-200/80">
                        <Calendar className="w-3.5 h-3.5 text-[#0E4EBD]" />
                        <span>{formatAppDate(s.date)}</span>
                        <span className="text-gray-300">•</span>
                        <Clock className="w-3.5 h-3.5 text-gray-500" />
                        <span>{format12HourTime(s.startTime)} – {format12HourTime(s.endTime)}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div className="p-3 bg-emerald-50/70 border border-emerald-200/80 rounded-xl">
                        <span className="text-[11px] font-bold text-emerald-900 uppercase tracking-wider block mb-1">
                          Time-In Window (Entry Scan)
                        </span>
                        <p className="text-sm font-black text-emerald-950 font-mono">
                          {s.timeInOpen && s.timeInClose
                            ? `${format12HourTime(s.timeInOpen)} — ${format12HourTime(s.timeInClose)}`
                            : s.startTime
                              ? `From ${format12HourTime(s.startTime)}`
                              : 'Standard'}
                        </p>
                      </div>

                      <div className={`p-3 rounded-xl border ${s.hasTimeOut ? 'bg-blue-50/70 border-blue-200/80' : 'bg-gray-50 border-gray-200'}`}>
                        <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                          Time-Out Window (Exit Scan)
                        </span>
                        <p className="text-sm font-black text-slate-900 font-mono">
                          {s.hasTimeOut
                            ? s.timeOutOpen && s.timeOutClose
                              ? `${format12HourTime(s.timeOutOpen)} — ${format12HourTime(s.timeOutClose)}`
                              : `Around ${format12HourTime(s.endTime)}`
                            : 'Not required for this session'}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* SECTION 6 — MARKETING & DOCUMENTATION STRATEGY */}
          <section
            ref={(el) => { sectionRefs.current['strategy'] = el; }}
            onMouseEnter={() => { setActiveSection('strategy'); setVisitedSections((p) => new Set([...p, 'strategy'])); }}
            className="space-y-4"
          >
            <SectionHeader
              title="6. Marketing & Documentation Strategy"
              subtitle="Form AP-01 promotional outreach channels and official documentation / coverage plans"
            />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Marketing Plan */}
              <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs space-y-3">
                <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                  <Megaphone className="w-4 h-4 text-[#0E4EBD]" />
                  <h4 className="text-sm font-bold text-[#001A4D]">Marketing & Publicity Plan</h4>
                  <span className="ml-auto text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                    {marketingPlanList.length} Channels
                  </span>
                </div>
                {marketingPlanList.length > 0 ? (
                  <div className="space-y-2">
                    {marketingPlanList.map((plan, i) => (
                      <div key={i} className="flex items-start gap-2.5 p-2.5 bg-blue-50/40 rounded-xl border border-blue-100/50">
                        <span className="text-[#0E4EBD] font-bold text-xs">📢</span>
                        <p className="text-[#001A4D] text-xs font-medium">{plan}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic py-4 text-center">No specific marketing plan submitted.</p>
                )}
              </div>

              {/* Documentation Plan */}
              <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs space-y-3">
                <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                  <FileText className="w-4 h-4 text-indigo-600" />
                  <h4 className="text-sm font-bold text-[#001A4D]">Documentation & Coverage Plan</h4>
                  <span className="ml-auto text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">
                    {documentationPlanList.length} Items
                  </span>
                </div>
                {documentationPlanList.length > 0 ? (
                  <div className="space-y-2">
                    {documentationPlanList.map((docItem, i) => (
                      <div key={i} className="flex items-start gap-2.5 p-2.5 bg-indigo-50/40 rounded-xl border border-indigo-100/50">
                        <span className="text-indigo-600 font-bold text-xs">📸</span>
                        <p className="text-indigo-950 text-xs font-medium">{docItem}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic py-4 text-center">No documentation plan submitted.</p>
                )}
              </div>
            </div>
          </section>

          {/* SECTION 7 — COMMITTEE TASK MATRIX */}
          <section
            ref={(el) => { sectionRefs.current['tasks'] = el; }}
            onMouseEnter={() => { setActiveSection('tasks'); setVisitedSections((p) => new Set([...p, 'tasks'])); }}
            className="space-y-4"
          >
            <SectionHeader
              title="7. Committee Task Matrix"
              subtitle="Assigned committee heads, member delegations, and milestone completion deadlines"
            />

            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xs">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200 text-xs uppercase text-gray-500 font-bold">
                  <tr>
                    <th className="px-4 py-3 text-left w-12">#</th>
                    <th className="px-4 py-3 text-left">Task / Deliverable</th>
                    <th className="px-4 py-3 text-left">Person Assigned</th>
                    <th className="px-4 py-3 text-left w-40">Target Completion Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-xs">
                  {tasksList.map((t, idx) => (
                    <tr key={t.id || idx} className="hover:bg-blue-50/40 transition-colors">
                      <td className="px-4 py-3 text-gray-400 font-mono">{idx + 1}</td>
                      <td className="px-4 py-3 font-semibold text-[#001A4D]">{t.taskName}</td>
                      <td className="px-4 py-3 text-gray-700">
                        <span className="px-2.5 py-1 bg-slate-100 rounded-md font-medium text-slate-800">
                          {t.assignedPerson || 'Unassigned'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 font-mono">
                        {t.completionDate ? formatAppDate(t.completionDate) : 'Not specified'}
                      </td>
                    </tr>
                  ))}
                  {tasksList.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-gray-400 italic">
                        No specific committee tasks listed.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* SECTION 8 — OFFICIAL FINANCIAL PROJECTIONS (FORM AP-01) */}
          <section
            ref={(el) => { sectionRefs.current['financials'] = el; }}
            onMouseEnter={() => { setActiveSection('financials'); setVisitedSections((p) => new Set([...p, 'financials'])); }}
            className="space-y-4"
          >
            <SectionHeader
              title="8. Official Financial Projections (Form AP-01)"
              subtitle="Standard 6-column revenue and expenditure breakdown with projected net balance"
            />

            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xs space-y-6 p-5">
              {/* Historical Reference Reviewer Banner */}
              {(() => {
                const histRef = fullProposal?.historicalReference || (event as any)?.historicalReference;
                if (!histRef) return null;

                const hasModifiedHistorical = Boolean(
                  histRef.isManuallyEdited ||
                  [...(financialProjections.revenues || []), ...(financialProjections.expenses || [])].some(
                    (i: any) => i.isHistoricalEdited || (i.originalLastYearActual !== undefined && i.lastYearActual !== i.originalLastYearActual)
                  )
                );

                if (hasModifiedHistorical) {
                  return (
                    <div className="p-3.5 bg-amber-50 border-2 border-amber-300 rounded-xl text-xs text-amber-950 flex items-start gap-2.5 shadow-2xs">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div className="leading-relaxed">
                        <strong className="block font-bold text-amber-900">
                          ⚠️ Reviewer Notice — Historical Budget Manually Adjusted:
                        </strong>
                        The proposer referenced previous activity{' '}
                        <strong>"{histRef.eventTitle}"</strong> ({histRef.schoolYear ? `SY ${histRef.schoolYear} • ` : ''}Original Past Budget: {formatPHP(histRef.originalTotalAmount)}), but one or more figures in <em>"Last Year's Actual"</em> were{' '}
                        <strong>manually modified</strong>. Modified lines display the original recorded database baseline below.
                      </div>
                    </div>
                  );
                }

                return (
                  <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-xl text-xs text-emerald-950 flex items-start gap-2.5 shadow-2xs">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div className="leading-relaxed">
                      <strong className="block font-bold text-emerald-900">
                        🔒 Verified Historical Baseline (Form AP-01 Comparative):
                      </strong>
                      The figures in <em>"Last Year's Actual"</em> are directly linked to the official past record of{' '}
                      <strong>"{histRef.eventTitle}"</strong> ({histRef.schoolYear ? `SY ${histRef.schoolYear} • ` : ''}Total: {formatPHP(histRef.originalTotalAmount)}) and have <strong>not been modified</strong>.
                    </div>
                  </div>
                );
              })()}

              {/* Revenues Table (if present) */}
              {financialProjections.revenues && financialProjections.revenues.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-emerald-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    Revenue Sources / Subsidies
                  </h4>
                  <div className="border border-gray-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-emerald-50/60 border-b border-gray-200 text-gray-600 font-bold uppercase">
                        <tr>
                          <th className="px-3 py-2 text-left w-10">#</th>
                          <th className="px-3 py-2 text-left">Description</th>
                          <th className="px-3 py-2 text-right">Last Year Actual</th>
                          <th className="px-3 py-2 text-right">This Year Proposed</th>
                          <th className="px-3 py-2 text-right font-black text-emerald-900">Total Amount</th>
                          <th className="px-3 py-2 text-left">Remarks</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {financialProjections.revenues.map((rev: any, i: number) => (
                          <tr key={rev.id || i} className="hover:bg-emerald-50/20">
                            <td className="px-3 py-2 text-gray-400 font-mono">{i + 1}</td>
                            <td className="px-3 py-2 font-medium text-gray-900">{rev.description}</td>
                            <td className="px-3 py-2 text-right font-mono text-gray-500">
                              {formatPHP(rev.lastYearActual || 0)}
                              {rev.originalLastYearActual !== undefined && rev.lastYearActual !== rev.originalLastYearActual && (
                                <span className="block text-[10px] text-amber-700 font-semibold" title={`Original recorded baseline was ${formatPHP(rev.originalLastYearActual)}`}>
                                  (orig: {formatPHP(rev.originalLastYearActual)})
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-gray-700">{formatPHP(rev.thisYearProposed || 0)}</td>
                            <td className="px-3 py-2 text-right font-mono font-bold text-emerald-700">{formatPHP(rev.totalAmount || 0)}</td>
                            <td className="px-3 py-2 text-gray-500">{rev.remarks || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Expenses Table (Form LF-01 Baseline Categories) */}
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-2">
                  <h4 className="text-xs font-bold text-[#001A4D] uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#0E4EBD]" />
                    Proposed Budget Baseline Categories (Form LF-01 Spending Baseline)
                  </h4>
                  <span className="text-[10px] text-slate-500 font-medium">
                    Approved spending guide for post-event financial liquidation
                  </span>
                </div>
                <div className="border border-gray-200 rounded-xl overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 border-b border-gray-200 text-gray-600 font-bold uppercase">
                      <tr>
                        <th className="px-3 py-2.5 text-left w-10">#</th>
                        <th className="px-3 py-2.5 text-left">Baseline Category / Scope</th>
                        <th className="px-3 py-2.5 text-right">Last Year's Actual</th>
                        <th className="px-3 py-2.5 text-right">Proposed Budget</th>
                        <th className="px-3 py-2.5 text-right font-black text-[#001A4D]">Total Baseline</th>
                        <th className="px-3 py-2.5 text-left">Scope / Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {financialProjections.expenses.map((exp: any, i: number) => {
                        const letter = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'][i] || `${i + 1}`;
                        return (
                          <tr key={exp.id || i} className="hover:bg-blue-50/20">
                            <td className="px-3 py-2.5 text-blue-700 font-mono font-bold">{letter}.</td>
                            <td className="px-3 py-2.5 font-semibold text-gray-900">{exp.description}</td>
                            <td className="px-3 py-2.5 text-right font-mono text-gray-500">
                              {formatPHP(exp.lastYearActual || 0)}
                              {exp.originalLastYearActual !== undefined && exp.lastYearActual !== exp.originalLastYearActual && (
                                <span className="block text-[10px] text-amber-700 font-semibold" title={`Original recorded baseline was ${formatPHP(exp.originalLastYearActual)}`}>
                                  (orig: {formatPHP(exp.originalLastYearActual)})
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono text-gray-700">{formatPHP(exp.thisYearProposed || 0)}</td>
                            <td className="px-3 py-2.5 text-right font-mono font-bold text-[#001A4D]">{formatPHP(exp.totalAmount || 0)}</td>
                            <td className="px-3 py-2.5 text-gray-500">{exp.remarks || '—'}</td>
                          </tr>
                        );
                      })}
                      {financialProjections.expenses.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-4 py-6 text-center text-gray-400 italic">
                            No expense line items submitted.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Financial Balance Summary Card */}
              <div className="bg-slate-900 text-white p-4 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-6 text-xs divide-x divide-slate-700">
                  <div>
                    <span className="text-slate-400 block mb-0.5">Total Revenue</span>
                    <span className="text-sm font-bold text-emerald-400 font-mono">{formatPHP(totalRevenueAmount)}</span>
                  </div>
                  <div className="pl-6">
                    <span className="text-slate-400 block mb-0.5">Total Expenses</span>
                    <span className="text-sm font-bold text-amber-400 font-mono">{formatPHP(totalExpenseAmount)}</span>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-xs text-slate-300 block mb-0.5 uppercase tracking-wider font-semibold">
                    Projected Net Balance
                  </span>
                  <span className={`text-lg font-black font-mono ${projectedBalance >= 0 ? 'text-emerald-400' : 'text-[#FFD41C]'}`}>
                    {formatPHP(projectedBalance)}
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* SECTION 9 — SIGNATORIES & APPROVAL PIPELINE */}
          <section
            ref={(el) => { sectionRefs.current['signatories'] = el; }}
            onMouseEnter={() => { setActiveSection('signatories'); setVisitedSections((p) => new Set([...p, 'signatories'])); }}
            className="space-y-4"
          >
            <SectionHeader
              title="9. Signatory Endorsements & Executive Review"
              subtitle="Real-time multi-stage approval tracker, verified electronic signatures, and reviewer remarks"
            />

            {/* SAS Stage 1 Action Banner when awaiting signature */}
            {isSasStepPending && (
              <div className="bg-gradient-to-r from-[#001A4D] via-[#002B7F] to-[#0E4EBD] text-white rounded-2xl p-4.5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm border border-blue-400/20">
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-xl bg-[#FFD41C] text-[#001A4D] flex items-center justify-center font-bold flex-shrink-0 shadow-xs">
                    <PenTool className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      Stage 1 SAS Endorsement Awaiting Your Signature
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FFD41C] text-[#001A4D]">Action Required</span>
                    </h4>
                    <p className="text-xs text-blue-100 mt-0.5">
                      Sign as <strong className="text-[#FFD41C]">{sasConfig.name}</strong> ({sasConfig.roleTitle}) to seal Stage 1 and advance to Stage 2.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleDecision('approve')}
                  className="px-4 py-2.5 bg-[#FFD41C] text-[#001A4D] hover:bg-amber-400 rounded-xl font-bold text-xs flex items-center gap-2 shadow-xs transition-transform active:scale-95 cursor-pointer whitespace-nowrap"
                >
                  <PenTool className="w-4 h-4" />
                  <span>Sign & Endorse Stage 1</span>
                </button>
              </div>
            )}

            <ActivitySignatoryTracker
              approvalChain={displayApprovalChain}
              currentStageIndex={fullProposal?.currentStageIndex || (activeEvent as any).currentStageIndex || (event as any).currentStageIndex || 1}
              proposalStatus={activeEvent.proposalStatus || event.proposalStatus}
              version={fullProposal?.version || (activeEvent as any).version || (event as any).version}
              versionLabel={fullProposal?.versionLabel || (activeEvent as any).versionLabel || (event as any).versionLabel}
              versionHistory={fullProposal?.versionHistory || (activeEvent as any).versionHistory || (event as any).versionHistory}
            />
          </section>

          {/* SECTION 10 — SUBMISSION HISTORY & AUDIT TRAIL */}
          <section
            ref={(el) => { sectionRefs.current['history'] = el; }}
            onMouseEnter={() => { setActiveSection('history'); setVisitedSections((p) => new Set([...p, 'history'])); }}
            className="space-y-4"
          >
            <SectionHeader
              title="10. Submission History & Review Trail"
              subtitle="Complete proposal lifecycle, admin decisions, and resubmission audit trail"
            />
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs">
              {displayProposalHistory && displayProposalHistory.length > 0 ? (
                <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-gray-200">
                  {displayProposalHistory.map((item: any, idx: number) => {
                    const itemDate = formatAppDateTime(item.performedAt, '—');

                    const isRejected = item.action === 'rejected';
                    const isApprovedAction = item.action === 'approved';
                    const isReturned = item.action === 'returned';
                    const isResubmitted = item.action === 'resubmitted';

                    const dotBg = isApprovedAction
                      ? 'bg-emerald-500'
                      : isRejected
                        ? 'bg-red-500'
                        : isReturned
                          ? 'bg-amber-500'
                          : isResubmitted
                            ? 'bg-[#0E4EBD]'
                            : 'bg-[#001A4D]';

                    return (
                      <div key={item.id || idx} className="relative flex items-start gap-3">
                        <div className={`absolute -left-[19px] top-1 w-3.5 h-3.5 rounded-full ${dotBg} ring-4 ring-white`} />
                        <div className="flex-1 bg-gray-50/70 border border-gray-200 rounded-xl p-3.5 space-y-1">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-xs uppercase tracking-wide text-[#001A4D]">
                                {item.action === 'created'
                                  ? 'Proposal Created'
                                  : item.action === 'submitted'
                                    ? 'Submitted for Review'
                                    : item.action === 'approved'
                                      ? 'Proposal Approved'
                                      : item.action === 'rejected'
                                        ? 'Proposal Rejected'
                                        : item.action === 'returned'
                                          ? 'Returned for Revision'
                                          : item.action === 'resubmitted'
                                            ? 'Proposal Resubmitted'
                                            : item.action === 'edited'
                                              ? 'Edited & Updated'
                                              : item.action === 'draft_saved'
                                                ? 'Draft Saved'
                                                : item.action}
                              </span>
                              {(item.versionLabel || item.version) && (
                                <span className="px-2 py-0.5 bg-blue-100 text-[#0E4EBD] font-mono text-[10px] font-bold rounded-md">
                                  {item.versionLabel || `v${item.version}.0`}
                                </span>
                              )}
                            </div>
                            <span className="text-gray-400 text-xs font-mono">{itemDate}</span>
                          </div>

                          {item.performedByName && (
                            <p className="text-gray-500 text-[11px]">
                              By: <strong className="text-gray-700 font-semibold">{item.performedByName}</strong>
                            </p>
                          )}

                          {item.reason && (
                            <p className="text-xs text-red-600 font-semibold mt-1">
                              Reason: {item.reason}
                            </p>
                          )}

                          {item.remarks && (
                            <p className="text-xs text-gray-700 bg-white p-2.5 rounded-lg border border-gray-200 mt-1 italic">
                              "{item.remarks}"
                            </p>
                          )}

                          {item.returnFlags && item.returnFlags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {item.returnFlags.map((flag, fIdx) => (
                                <span key={fIdx} className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[11px] rounded-full font-medium">
                                  ⚠ {flag}
                                </span>
                              ))}
                            </div>
                          )}

                          {item.stepRemarks && Object.keys(item.stepRemarks).length > 0 && (() => {
                            const dedupedDirectives = new Map<number, { label: string; text: string }>();
                            Object.entries(item.stepRemarks).forEach(([key, directive]: [string, any]) => {
                              if (!directive || typeof directive !== 'string' || !directive.trim()) return;
                              const numMatch = key.match(/(?:step[-_\s]*)?(\d+)/i);
                              if (!numMatch) return;
                              const stepNum = Number(numMatch[1]);
                              if (!dedupedDirectives.has(stepNum)) {
                                const matchedFlag = RETURN_FLAGS_GROUPED.find((r) => r.stepNumber === stepNum);
                                const label = matchedFlag ? matchedFlag.label : `Step ${stepNum}`;
                                dedupedDirectives.set(stepNum, { label, text: directive.trim() });
                              }
                            });

                            if (dedupedDirectives.size === 0) return null;

                            return (
                              <div className="mt-2 space-y-1.5 bg-amber-50/80 border border-amber-200 rounded-xl p-3">
                                <p className="text-[11px] font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                                  <span>Step-by-Step Revision Directives</span>
                                </p>
                                <div className="space-y-1.5 mt-1">
                                  {Array.from(dedupedDirectives.entries())
                                    .sort(([a], [b]) => a - b)
                                    .map(([stepNum, { label, text }]) => (
                                      <div key={stepNum} className="text-xs bg-white rounded-lg p-2.5 border border-amber-200 shadow-2xs">
                                        <span className="font-bold text-[#001A4D] block text-[11px] mb-0.5">{label}:</span>
                                        <p className="text-gray-700 text-xs leading-relaxed">{text}</p>
                                      </div>
                                    ))}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-6 text-gray-400 text-xs">
                  No previous revision history recorded.
                </div>
              )}
            </div>
          </section>
        </main>

        {/* RIGHT COLUMN — 3rd Pane: Decision & Execution Side */}
        <aside className="w-80 lg:w-96 flex-shrink-0 border-l border-gray-200 bg-gray-50/70 flex flex-col overflow-y-auto p-5 space-y-5">
          {isCancelled ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <XCircle className="w-5 h-5 text-red-600" />
                <div>
                  <p className="text-[#001A4D] font-bold text-base">Cancelled Activity</p>
                  <p className="text-gray-500 text-xs">Official cancellation notice.</p>
                </div>
              </div>

              <div className="bg-gradient-to-br from-red-600 to-rose-700 rounded-2xl p-5 text-white shadow-xs space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                    <XCircle className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-base text-white">Activity Cancelled</h4>
                    <p className="text-xs text-red-100">All attendance gates closed</p>
                  </div>
                </div>
                {event.cancelledAt && (
                  <div className="pt-2 border-t border-white/20 flex items-center justify-between text-xs text-white/90">
                    <span>Cancelled Date:</span>
                    <span className="font-semibold font-mono">{formatAppDateTime(event.cancelledAt)}</span>
                  </div>
                )}
              </div>

              {event.cancellationReason && (
                <div className="bg-white border border-red-200 rounded-2xl p-4 text-xs text-red-900 shadow-xs">
                  <p className="font-bold text-red-950 mb-1">Cancellation Reason:</p>
                  <p className="leading-relaxed">{event.cancellationReason}</p>
                </div>
              )}

              <button
                onClick={onClose}
                className="w-full py-2.5 bg-[#001A4D] text-white hover:bg-[#001A4D]/90 rounded-xl font-bold text-xs transition-colors shadow-xs cursor-pointer"
              >
                Close & Back to Approvals
              </button>
            </div>
          ) : isApproved || isCompleted ? (
            isSasCreated ? (
              /* 2. SAS INSTITUTIONAL EVENT — Management Controls (Only when fully endorsed/approved) */
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <Shield className="w-5 h-5 text-[#0E4EBD]" />
                  <div>
                    <p className="text-[#001A4D] font-bold text-base">SAS Institutional Activity</p>
                    <p className="text-gray-500 text-xs">Direct activity created by Student Affairs & Services</p>
                  </div>
                </div>

                {/* Status Banner */}
                <div className="bg-gradient-to-br from-[#001A4D] via-[#002B7F] to-[#0E4EBD] rounded-2xl p-5 text-white shadow-xs space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                      <CheckCircle2 className="w-6 h-6 text-[#FFD41C]" />
                    </div>
                    <div>
                      <h4 className="font-extrabold text-base text-white">
                        {isCompleted ? 'Activity Completed' : 'Active Institutional Event'}
                      </h4>
                      <p className="text-xs text-blue-100">
                        Managed by Student Affairs & Services
                      </p>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-white/20 flex items-center justify-between text-xs text-white/90">
                    <span>Host:</span>
                    <span className="font-semibold text-[#FFD41C]">{orgName}</span>
                  </div>
                </div>

                {/* Event Parameters Card */}
                <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs space-y-3">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                    Activity Parameters
                  </p>
                  <div className="space-y-2.5 text-xs">
                    <div className="flex justify-between py-1.5 border-b border-gray-100">
                      <span className="text-gray-500">Approved Budget</span>
                      <span className="font-bold text-[#001A4D] font-mono">{formatPHP(totalExpenseAmount)}</span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-gray-100">
                      <span className="text-gray-500">Expected Attendance</span>
                      <span className="font-bold text-[#001A4D]">{event.expectedParticipantCount || 0} Students</span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-gray-100">
                      <span className="text-gray-500">Sessions</span>
                      <span className="font-bold text-[#001A4D]">{event.sessions?.length || 1} Session{(event.sessions?.length || 1) > 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex justify-between py-1.5">
                      <span className="text-gray-500">Venue</span>
                      <span className="font-bold text-[#001A4D] truncate max-w-[150px]">{venueName}</span>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="space-y-2 pt-1">
                  <button
                    onClick={handleExportPDF}
                    disabled={exportingPdf}
                    className="w-full py-2.5 bg-[#FFD41C] text-[#001A4D] hover:bg-amber-400 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    <Download className="w-4 h-4" />
                    <span>{exportingPdf ? 'Exporting Form AP-01...' : 'Export Form AP-01 PDF'}</span>
                  </button>
                  <button
                    onClick={onClose}
                    className="w-full py-2.5 bg-[#001A4D] text-white hover:bg-[#001A4D]/90 rounded-xl font-bold text-xs transition-colors shadow-xs cursor-pointer"
                  >
                    Close & Back to Approvals
                  </button>
                </div>
              </div>
            ) : (
              /* 3. APPROVED OFFICER / ORGANIZATION PROPOSAL */
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <div>
                  <p className="text-[#001A4D] font-bold text-base">
                    {isCompleted ? 'Completed Activity' : 'Approved Activity'}
                  </p>
                  <p className="text-gray-500 text-xs">
                    {isCompleted ? 'Activity completed and recorded.' : 'Proposal approved. Operational studio unlocked.'}
                  </p>
                </div>
              </div>

              {/* Status Banner */}
              <div className="bg-gradient-to-br from-[#001A4D] via-[#002B7F] to-[#0E4EBD] rounded-2xl p-5 text-white shadow-xs space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                    <CheckCircle2 className="w-6 h-6 text-[#FFD41C]" />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-base text-white">
                      {isCompleted ? 'Activity Completed' : 'Activity Approved & Active'}
                    </h4>
                    <p className="text-xs text-blue-100">
                      Official Form AP-01 Record
                    </p>
                  </div>
                </div>
                <div className="pt-2 border-t border-white/20 flex items-center justify-between text-xs text-white/90">
                  <span>Host:</span>
                  <span className="font-semibold text-[#FFD41C]">{orgName}</span>
                </div>
                {event.approvedAt && (
                  <div className="pt-1 border-t border-white/10 flex items-center justify-between text-xs text-white/80">
                    <span>Approved Date:</span>
                    <span className="font-semibold font-mono">{formatAppDateTime(event.approvedAt)}</span>
                  </div>
                )}
              </div>

              {/* Approved Parameters Summary Card */}
              <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs space-y-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                  Approved Parameters
                </p>
                <div className="space-y-2.5 text-xs">
                  <div className="flex justify-between py-1.5 border-b border-gray-100">
                    <span className="text-gray-500">Approved Budget</span>
                    <span className="font-bold text-[#001A4D] font-mono">{formatPHP(totalExpenseAmount)}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-gray-100">
                    <span className="text-gray-500">Expected Attendance</span>
                    <span className="font-bold text-[#001A4D]">{event.expectedParticipantCount || 0} Students</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-gray-100">
                    <span className="text-gray-500">Sessions</span>
                    <span className="font-bold text-[#001A4D]">{event.sessions?.length || 1} Session{(event.sessions?.length || 1) > 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex justify-between py-1.5">
                    <span className="text-gray-500">Venue</span>
                    <span className="font-bold text-[#001A4D] truncate max-w-[150px]">{venueName}</span>
                  </div>
                </div>
              </div>

              {/* Adviser Approval Remarks */}
              {event.adviserRemarks && (
                <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs space-y-2">
                  <div className="flex items-center gap-2 text-[#001A4D] font-bold text-xs">
                    <Shield className="w-3.5 h-3.5 text-[#0E4EBD]" />
                    <span>Adviser Approval Remarks</span>
                  </div>
                  <p className="text-xs text-gray-700 bg-gray-50 p-3 rounded-xl border border-gray-100 leading-relaxed whitespace-pre-wrap">
                    {event.adviserRemarks}
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="space-y-2 pt-1">
                <button
                  onClick={handleExportPDF}
                  disabled={exportingPdf}
                  className="w-full py-2.5 bg-[#FFD41C] text-[#001A4D] hover:bg-amber-400 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                >
                  <Download className="w-4 h-4" />
                  <span>{exportingPdf ? 'Exporting Form AP-01...' : 'Export Form AP-01 PDF'}</span>
                </button>
                <button
                  onClick={onClose}
                  className="w-full py-2.5 bg-[#001A4D] text-white hover:bg-[#001A4D]/90 rounded-xl font-bold text-xs transition-colors shadow-xs cursor-pointer"
                >
                  Close & Back to Approvals
                </button>
              </div>
            </div>
            )
          ) : showAdviserDecision ? (
            /* PENDING / RETURNED / REJECTED PROPOSALS — Active Adviser Decision Controls (Org Proposal under SAS Review) */
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Gavel className="w-5 h-5 text-[#001A4D]" />
                <div>
                  <p className="text-[#001A4D] font-bold text-base">Adviser Decision</p>
                  <p className="text-gray-500 text-xs">Review sections & manage status.</p>
                </div>
              </div>

              {decision !== 'none' && (
                <div className={`rounded-2xl p-4 text-center ${decision === 'returned'
                    ? 'bg-gradient-to-br from-[#FFC107] to-[#F59E0B]'
                    : 'bg-gradient-to-br from-[#EF4444] to-[#F97316]'
                  }`}>
                  {decision === 'returned' ? (
                    <RotateCcw className="w-8 h-8 text-[#001A4D] mx-auto mb-1" />
                  ) : (
                    <XCircle className="w-8 h-8 text-white mx-auto mb-1" />
                  )}
                  <p className={`font-bold text-base ${decision === 'returned' ? 'text-[#001A4D]' : 'text-white'}`}>
                    {decision === 'returned' ? 'Returned for Revision' : 'Proposal Rejected'}
                  </p>
                  <p className="text-xs text-white/80 mt-1">Status set by Administrator</p>
                </div>
              )}

              {/* Decision Action Buttons */}
              <div className="space-y-2.5 pt-1">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  {decision !== 'none' ? 'Change Decision' : 'Select Decision'}
                </p>
                <div>
                  <button
                    onClick={() => handleDecision('approve')}
                    className={`w-full h-11 flex items-center justify-center gap-2 text-white font-bold text-xs rounded-xl transition-all shadow-xs cursor-pointer ${hasSubsequentStages && isSasStepPending
                        ? 'bg-gradient-to-r from-[#001A4D] via-[#002B7F] to-[#0E4EBD] hover:from-[#002B7F] hover:to-[#001A4D]'
                        : 'bg-gradient-to-r from-[#22C55E] to-[#16A34A] hover:from-[#16A34A] hover:to-[#22C55E]'
                      }`}
                  >
                    {hasSubsequentStages && isSasStepPending ? (
                      <>
                        <PenTool className="w-4 h-4 text-[#FFD41C]" />
                        <span>Endorse & Sign as SAS (Stage 1)</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        <span>Approve Activity Proposal</span>
                      </>
                    )}
                  </button>
                </div>
                <div>
                  <button
                    onClick={() => handleDecision('return')}
                    className="w-full h-11 flex items-center justify-center gap-2 bg-[#FFC107] text-[#001A4D] font-bold text-xs rounded-xl hover:bg-[#F59E0B] transition-colors shadow-xs cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4" />
                    {decision === 'returned' ? 'Update Return Flags' : 'Return for Revision'}
                  </button>
                </div>
                <div>
                  <button
                    onClick={() => handleDecision('reject')}
                    className="w-full h-11 flex items-center justify-center gap-2 bg-white border border-[#EF4444] text-[#EF4444] font-bold text-xs rounded-xl hover:bg-red-50 transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                    {decision === 'rejected' ? 'Update Rejection / Remarks' : 'Reject Proposal'}
                  </button>
                </div>
              </div>

              <button
                onClick={onClose}
                className="w-full text-center text-gray-500 text-xs hover:underline pt-2 cursor-pointer"
              >
                Close & Back to Approvals
              </button>
            </div>
          ) : isSasCreated ? (
            /* SAS INSTITUTIONAL EVENT — In Signatory Routing (Not an Adviser Decision) */
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <Shield className="w-5 h-5 text-[#0E4EBD]" />
                <div>
                  <p className="text-[#001A4D] font-bold text-base">SAS Institutional Activity</p>
                  <p className="text-gray-500 text-xs">Direct activity created by Student Affairs & Services</p>
                </div>
              </div>

              {/* Status Banner */}
              <div className="bg-gradient-to-br from-[#001A4D] via-[#002B7F] to-[#0E4EBD] rounded-2xl p-5 text-white shadow-xs space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                    <Clock className="w-6 h-6 text-[#FFD41C]" />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-base text-white">In Signatory Routing</h4>
                    <p className="text-xs text-blue-100">
                      Awaiting Campus Signatory Approvals
                    </p>
                  </div>
                </div>
                <div className="pt-2 border-t border-white/20 flex items-center justify-between text-xs text-white/90">
                  <span>Routing Progress:</span>
                  <span className="font-semibold text-[#FFD41C]">
                    {displayApprovalChain.length > 0
                      ? `${displayApprovalChain.filter((s) => s.status === 'approved' || s.status === 'endorsed').length} of ${displayApprovalChain.length} Signed`
                      : 'Pending Signatories'}
                  </span>
                </div>
              </div>

              {/* Info Box */}
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-xs text-blue-900 shadow-xs space-y-1">
                <p className="font-bold text-blue-950 flex items-center gap-1.5">
                  <PenTool className="w-3.5 h-3.5 text-[#0E4EBD]" />
                  <span>Institutional Routing Active</span>
                </p>
                <p className="text-blue-800 leading-relaxed text-[11px]">
                  This activity was authored by SAS. Operational tools (Publishing, Attendance, Financial Liquidation) will automatically unlock once all designated signatories have completed their endorsement.
                </p>
              </div>

              {/* Activity Parameters Card */}
              <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs space-y-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                  Activity Parameters
                </p>
                <div className="space-y-2.5 text-xs">
                  <div className="flex justify-between py-1.5 border-b border-gray-100">
                    <span className="text-gray-500">Proposed Budget</span>
                    <span className="font-bold text-[#001A4D] font-mono">{formatPHP(totalExpenseAmount)}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-gray-100">
                    <span className="text-gray-500">Expected Attendance</span>
                    <span className="font-bold text-[#001A4D]">{event.expectedParticipantCount || 0} Students</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-gray-100">
                    <span className="text-gray-500">Sessions</span>
                    <span className="font-bold text-[#001A4D]">{event.sessions?.length || 1} Session{(event.sessions?.length || 1) > 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex justify-between py-1.5">
                    <span className="text-gray-500">Venue</span>
                    <span className="font-bold text-[#001A4D] truncate max-w-[150px]">{venueName}</span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-2 pt-1">
                <button
                  onClick={handleExportPDF}
                  disabled={exportingPdf}
                  className="w-full py-2.5 bg-[#FFD41C] text-[#001A4D] hover:bg-amber-400 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                >
                  <Download className="w-4 h-4" />
                  <span>{exportingPdf ? 'Exporting Form AP-01...' : 'Export Form AP-01 PDF'}</span>
                </button>
                <button
                  onClick={() => setShowWithdrawModal(true)}
                  disabled={isWithdrawing}
                  className="w-full py-2.5 bg-amber-50 text-amber-800 border border-amber-300 hover:bg-amber-100 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                >
                  <Undo2 className="w-4 h-4 text-amber-600" />
                  <span>Withdraw Submission to Edit</span>
                </button>
                <button
                  onClick={onClose}
                  className="w-full py-2.5 bg-[#001A4D] text-white hover:bg-[#001A4D]/90 rounded-xl font-bold text-xs transition-colors shadow-xs cursor-pointer"
                >
                  Close & Back to Approvals
                </button>
              </div>
            </div>
          ) : (
            /* ORG PROPOSAL ENDORSED BY SAS — Awaiting Subsequent Campus Signatories */
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <div>
                  <p className="text-[#001A4D] font-bold text-base">Endorsed by SAS</p>
                  <p className="text-gray-500 text-xs">Awaiting subsequent campus signatories</p>
                </div>
              </div>

              {/* Status Banner */}
              <div className="bg-gradient-to-br from-[#001A4D] via-[#002B7F] to-[#0E4EBD] rounded-2xl p-5 text-white shadow-xs space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                    <CheckCircle2 className="w-6 h-6 text-[#FFD41C]" />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-base text-white">SAS Endorsement Complete</h4>
                    <p className="text-xs text-blue-100">
                      Routing in Progress
                    </p>
                  </div>
                </div>
                <div className="pt-2 border-t border-white/20 flex items-center justify-between text-xs text-white/90">
                  <span>Routing Progress:</span>
                  <span className="font-semibold text-[#FFD41C]">
                    {displayApprovalChain.filter((s) => s.status === 'approved' || s.status === 'endorsed').length} of {displayApprovalChain.length} Signatures
                  </span>
                </div>
              </div>

              {/* Next Signatories Card */}
              {displayApprovalChain.filter((s) => s.status !== 'approved' && s.status !== 'endorsed').length > 0 && (
                <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs space-y-2.5">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                    Pending Campus Signatories
                  </p>
                  <div className="space-y-2 text-xs">
                    {displayApprovalChain.filter((s) => s.status !== 'approved' && s.status !== 'endorsed').map((s, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-gray-50 border border-gray-100">
                        <div>
                          <p className="font-bold text-gray-800">{s.signatoryName || s.roleTitle}</p>
                          <p className="text-[11px] text-gray-500">{s.roleTitle} {s.department ? `• ${s.department}` : ''}</p>
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800">
                          Pending
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="space-y-2 pt-1">
                <button
                  onClick={handleExportPDF}
                  disabled={exportingPdf}
                  className="w-full py-2.5 bg-[#FFD41C] text-[#001A4D] hover:bg-amber-400 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                >
                  <Download className="w-4 h-4" />
                  <span>{exportingPdf ? 'Exporting Form AP-01...' : 'Export Form AP-01 PDF'}</span>
                </button>
                <button
                  onClick={onClose}
                  className="w-full py-2.5 bg-[#001A4D] text-white hover:bg-[#001A4D]/90 rounded-xl font-bold text-xs transition-colors shadow-xs cursor-pointer"
                >
                  Close & Back to Approvals
                </button>
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* ===== CONFIRMATION MODALS ===== */}

      {/* APPROVE / ENDORSE MODAL WITH SAS ELECTRONIC SIGNATURE SEAL */}
      {activeModal === 'approve' && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setActiveModal('none')} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[92vh]">
            <div className={`px-6 py-5 flex items-center gap-4 flex-shrink-0 ${hasSubsequentStages && isSasStepPending
                ? 'bg-gradient-to-r from-[#001A4D] via-[#002B7F] to-[#0E4EBD]'
                : 'bg-gradient-to-r from-[#22C55E] to-[#16A34A]'
              }`}>
              <div className="w-11 h-11 bg-white/20 rounded-full flex items-center justify-center">
                {hasSubsequentStages && isSasStepPending ? (
                  <PenTool className="w-6 h-6 text-[#FFD41C]" />
                ) : (
                  <CheckCircle className="w-6 h-6 text-white" />
                )}
              </div>
              <div>
                <h3 className="text-white font-bold text-lg">
                  {hasSubsequentStages && isSasStepPending
                    ? 'Stage 1 Endorsement & Electronic Signature'
                    : 'Confirm Activity Proposal Approval'}
                </h3>
                <p className="text-[#FFD41C] text-sm truncate max-w-md">{event.title}</p>
              </div>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              {/* Pipeline Status Banner */}
              {hasSubsequentStages && isSasStepPending ? (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 text-[#0E4EBD] flex items-center justify-center flex-shrink-0 mt-0.5">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div className="text-xs text-blue-900 leading-relaxed">
                    <p className="font-bold">Stage 1: Student Affairs & Services (SAS) Endorsement</p>
                    <p className="text-blue-700 mt-0.5">
                      Your master electronic signature will be sealed onto Stage 1 of Form AP-01. Once signed, the proposal will automatically advance to <strong>Stage 2 (Academic & Dean Endorsements)</strong>.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div className="text-xs text-emerald-900 leading-relaxed">
                    <p className="font-bold">Executive Activity Authorization</p>
                    <p className="text-emerald-700 mt-0.5">
                      Approving this proposal officially confirms campus compliance, unlocks the event's operational studio, and enables attendee scanners and passes.
                    </p>
                  </div>
                </div>
              )}

              {/* Official SAS Signatory Card */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-[#0E4EBD]" />
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Official SAS Signatory Identity
                    </span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 bg-blue-100 text-[#001A4D] rounded font-bold">
                    Settings Managed
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Signatory Name</span>
                    <span className="font-bold text-[#001A4D] truncate block">{sasConfig.name || 'SAS Signatory'}</span>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Position Title</span>
                    <span className="font-bold text-[#001A4D] truncate block">{sasConfig.roleTitle || 'SAS Coordinator'}</span>
                  </div>
                </div>

                {/* Digital Signature Box */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-[#001A4D] flex items-center gap-1.5">
                      <FileSignature className="w-3.5 h-3.5 text-[#0E4EBD]" />
                      Official Electronic Signature Seal
                    </span>
                    {(sasConfig.signatureUrl || modalSignatureDataUrl) && !isDrawingModalSig && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsDrawingModalSig(true);
                          setTimeout(() => clearModalCanvas(), 50);
                        }}
                        className="text-[11px] font-bold text-[#0E4EBD] hover:underline cursor-pointer flex items-center gap-1"
                      >
                        <PenTool className="w-3 h-3" />
                        Redraw Signature
                      </button>
                    )}
                  </div>

                  {/* Registered Signature Preview */}
                  {(sasConfig.signatureUrl || modalSignatureDataUrl) && !isDrawingModalSig ? (
                    <div className="bg-white border-2 border-emerald-500/40 rounded-xl p-3 flex flex-col items-center justify-center relative shadow-xs">
                      <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-[10px] font-bold">
                        <ShieldCheck className="w-3 h-3" />
                        Verified Active Signature
                      </div>
                      <div className="h-20 w-full flex items-center justify-center overflow-hidden my-1">
                        <img
                          src={modalSignatureDataUrl || sasConfig.signatureUrl}
                          alt="SAS Signature"
                          className="max-h-full max-w-full object-contain filter contrast-125"
                        />
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono text-center border-t border-slate-100 pt-1.5 w-full">
                        Official Cryptographic Seal • Form AP-01 Digital Endorsement
                      </div>
                    </div>
                  ) : (
                    /* Inline Interactive Signature Pad */
                    <div className="bg-white border border-slate-300 rounded-xl p-3 space-y-2">
                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span>Draw your signature below using mouse, stylus, or touch:</span>
                        {modalHasDrawn && (
                          <button
                            type="button"
                            onClick={clearModalCanvas}
                            className="text-red-500 font-bold hover:underline cursor-pointer"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      <div className="border-2 border-dashed border-slate-300 rounded-lg overflow-hidden bg-slate-50/50 touch-none">
                        <canvas
                          ref={modalCanvasRef}
                          width={480}
                          height={140}
                          onMouseDown={startModalDrawing}
                          onMouseMove={drawModalMove}
                          onMouseUp={stopModalDrawing}
                          onMouseLeave={stopModalDrawing}
                          onTouchStart={startModalDrawing}
                          onTouchMove={drawModalMove}
                          onTouchEnd={stopModalDrawing}
                          className="w-full h-28 cursor-crosshair block"
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-slate-400 italic">Black ink compliant • Saved to SAS Settings</span>
                        {sasConfig.signatureUrl && isDrawingModalSig && (
                          <button
                            type="button"
                            onClick={() => setIsDrawingModalSig(false)}
                            className="text-[11px] text-slate-600 hover:underline cursor-pointer"
                          >
                            Cancel & Use Existing
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Remarks Field */}
              <div>
                <p className="text-gray-700 font-bold text-xs mb-1.5 flex items-center justify-between">
                  <span>Adviser Endorsement Remarks / Instructions</span>
                  <span className="text-gray-400 text-[10px] font-normal">Optional</span>
                </p>
                <textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  rows={3}
                  placeholder="Add any formal directives or guidance for subsequent stage reviewers and student officers..."
                  className="w-full text-sm border border-gray-200 rounded-xl p-3 focus:ring-2 focus:ring-[#0E4EBD]/30 focus:border-[#0E4EBD] outline-none resize-none text-[#001A4D]"
                />
              </div>
            </div>

            <div className="p-4 border-t border-gray-200 bg-white flex gap-3 flex-shrink-0">
              <button
                onClick={() => {
                  setActiveModal('none');
                  setIsDrawingModalSig(false);
                }}
                disabled={submitting}
                className="flex-1 py-3 border border-gray-300 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={confirmApprove}
                disabled={submitting || (!sasConfig.signatureUrl && !modalSignatureDataUrl)}
                className={`flex-1 py-3 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer transition-all ${hasSubsequentStages && isSasStepPending
                    ? 'bg-gradient-to-r from-[#001A4D] to-[#0E4EBD] hover:from-[#002B7F] hover:to-[#001A4D]'
                    : 'bg-gradient-to-r from-[#22C55E] to-[#16A34A] hover:from-[#16A34A] hover:to-[#22C55E]'
                  }`}
              >
                {hasSubsequentStages && isSasStepPending ? (
                  <>
                    <PenTool className="w-4 h-4 text-[#FFD41C]" />
                    <span>{submitting ? 'Endorsing & Signing...' : 'Endorse & Seal Stage 1'}</span>
                  </>
                ) : (
                  <>
                    <Rocket className="w-4 h-4" />
                    <span>{submitting ? 'Approving...' : 'Approve Activity'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RETURN MODAL (ALIGNED TO 7 FORM AP-01 STEPS) */}
      {activeModal === 'return' && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setActiveModal('none')} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-gradient-to-r from-[#FFC107] to-[#F59E0B] px-6 py-5 flex items-center gap-4 flex-shrink-0">
              <div className="w-11 h-11 bg-[#001A4D]/20 rounded-full flex items-center justify-center">
                <RotateCcw className="w-6 h-6 text-[#001A4D]" />
              </div>
              <div>
                <h3 className="text-[#001A4D] font-bold text-lg">Return Proposal for Revision</h3>
                <p className="text-[#001A4D]/70 text-sm truncate max-w-xs">{event.title}</p>
              </div>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-1 h-4 bg-[#0E4EBD] rounded-full" />
                  <p className="text-[#001A4D] font-bold text-sm">
                    Select Steps Requiring Revision & Add Specific Directives <span className="text-red-500">*</span>
                  </p>
                </div>
                <p className="text-xs text-slate-500 mb-3">
                  Each selected step must include concrete revision instructions. The maker cannot proceed through these steps until they have modified the required content.
                </p>

                <div className="space-y-3 bg-gray-50 p-3 rounded-xl border border-gray-200">
                  {RETURN_FLAGS_GROUPED.map((item) => {
                    const isSelected = returnFlags.includes(item.flag);
                    const stepKey = `step_${item.stepNumber}`;
                    const currentDirective = stepRemarks[stepKey] || stepRemarks[String(item.stepNumber)] || stepRemarks[item.flag] || '';

                    return (
                      <div
                        key={item.stepNumber}
                        className={`rounded-xl border transition-all p-3 ${
                          isSelected
                            ? 'bg-amber-50/70 border-amber-300 ring-1 ring-amber-300/60'
                            : 'bg-white border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <label className="flex items-start gap-2.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {
                              setReturnFlags((p) =>
                                p.includes(item.flag) ? p.filter((f) => f !== item.flag) : [...p, item.flag]
                              );
                            }}
                            className="accent-amber-500 w-4 h-4 rounded mt-0.5"
                          />
                          <div className="flex-1 min-w-0">
                            <span className="text-xs font-bold text-[#001A4D] block">{item.label}</span>
                            <span className="text-[11px] text-gray-500 block leading-tight mt-0.5">{item.description}</span>
                          </div>
                        </label>

                        {isSelected && (
                          <div className="mt-3 pt-2.5 border-t border-amber-200/80 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-bold text-amber-900 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3 text-amber-600" />
                                Specific Revision Directive for Step {item.stepNumber} <span className="text-red-500">*</span>
                              </span>
                              <span className="text-[10px] text-amber-700 font-semibold uppercase tracking-wider">Required</span>
                            </div>
                            <textarea
                              value={currentDirective}
                              onChange={(e) => {
                                const val = e.target.value;
                                setStepRemarks((prev) => ({
                                  ...prev,
                                  [`step_${item.stepNumber}`]: val,
                                }));
                              }}
                              rows={2}
                              placeholder={`Specify exactly what must be corrected or revised in Step ${item.stepNumber}...`}
                              className="w-full text-xs border border-amber-300 rounded-lg p-2.5 bg-white focus:ring-2 focus:ring-amber-400 focus:border-transparent outline-none leading-relaxed text-[#001A4D]"
                            />
                            {!currentDirective.trim() && (
                              <p className="text-[11px] text-red-600 font-medium flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" /> Specific directive required for Step {item.stepNumber} before returning.
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[#001A4D] font-bold text-xs">
                    Overall Summary Remarks / Advice <span className="text-gray-400 font-normal">(Optional)</span>
                  </p>
                </div>
                <textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  rows={2}
                  placeholder="Optional general message or guidance for the proposal maker..."
                  className="w-full text-xs border border-gray-300 rounded-xl p-2.5 focus:ring-2 focus:ring-amber-400 focus:border-transparent outline-none resize-none text-[#001A4D]"
                />
              </div>
            </div>
            <div className="p-4 border-t border-gray-200 bg-white flex gap-3 flex-shrink-0">
              <button
                onClick={() => setActiveModal('none')}
                disabled={submitting}
                className="flex-1 py-3 border border-gray-300 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={confirmReturn}
                disabled={
                  submitting ||
                  returnFlags.length === 0 ||
                  RETURN_FLAGS_GROUPED.filter((item) => returnFlags.includes(item.flag)).some(
                    (item) => !(
                      stepRemarks[String(item.stepNumber)]?.trim() ||
                      stepRemarks[item.flag]?.trim() ||
                      stepRemarks[`step_${item.stepNumber}`]?.trim()
                    )
                  )
                }
                className="flex-1 py-3 bg-gradient-to-r from-[#FFC107] to-[#F59E0B] text-[#001A4D] rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer shadow-xs"
              >
                <Send className="w-4 h-4" /> {submitting ? 'Returning...' : 'Return for Revision'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REJECT MODAL */}
      {activeModal === 'reject' && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setActiveModal('none')} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="bg-gradient-to-r from-[#EF4444] to-[#F97316] px-6 py-5 flex items-center gap-4">
              <div className="w-11 h-11 bg-white/20 rounded-full flex items-center justify-center">
                <X className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-white font-bold text-lg">Confirm Proposal Rejection</h3>
                <p className="text-[#FFD41C] text-sm">{event.title}</p>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <p className="text-[#001A4D] font-bold text-sm mb-1.5">
                  Rejection Reason Category <span className="text-red-500">*</span>
                </p>
                <select
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-400 focus:border-transparent"
                >
                  <option value="">Select rejection reason category...</option>
                  {REJECTION_REASONS.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </div>

              <div>
                <p className="text-[#001A4D] font-bold text-sm mb-1.5">Adviser Feedback for Officer</p>
                <textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  rows={4}
                  placeholder="Provide details explaining the rejection and what policies were breached..."
                  className="w-full text-sm border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-red-400 focus:border-transparent outline-none resize-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setActiveModal('none')}
                  disabled={submitting}
                  className="flex-1 py-3 border border-gray-300 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmReject}
                  disabled={submitting}
                  className="flex-1 py-3 bg-gradient-to-r from-[#EF4444] to-[#F97316] text-white rounded-xl text-sm font-bold disabled:opacity-40 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <X className="w-4 h-4" /> {submitting ? 'Rejecting...' : 'Confirm Rejection'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CANCEL EVENT MODAL */}
      {showCancelModal && (
        <CancelEventModal
          event={event}
          role="admin"
          userRole="admin"
          userId={profile?.uid || 'admin-user'}
          userName={profile?.displayName || 'SAO Admin'}
          isOpen={showCancelModal}
          onClose={() => setShowCancelModal(false)}
          onSuccess={() => {
            setShowCancelModal(false);
            onClose();
          }}
        />
      )}

      {/* CONCLUDE EVENT MODAL */}
      {showConcludeModal && (
        <ConcludeEventModal
          event={event}
          isOpen={showConcludeModal}
          onClose={() => setShowConcludeModal(false)}
          adminUid={profile?.uid || 'admin-user'}
          adminName={profile?.displayName || 'SAO Admin'}
          onSuccess={() => {
            setShowConcludeModal(false);
            onClose();
          }}
        />
      )}

      {/* ARCHIVE EVENT MODAL */}
      {showArchiveModal && (
        <ArchiveEventModal
          event={event}
          isOpen={showArchiveModal}
          onClose={() => setShowArchiveModal(false)}
          adminUid={profile?.uid || 'admin-user'}
          adminName={profile?.displayName || 'SAO Admin'}
          onSuccess={() => {
            setShowArchiveModal(false);
            onClose();
          }}
        />
      )}

      {/* DELETE ARCHIVED EVENT MODAL */}
      {showDeleteModal && (
        <DeleteArchivedEventModal
          event={event}
          isOpen={showDeleteModal}
          onClose={() => setShowDeleteModal(false)}
          adminUid={profile?.uid || 'admin-user'}
          adminName={profile?.displayName || 'SAO Admin'}
          onSuccess={() => {
            setShowDeleteModal(false);
            onClose();
          }}
        />
      )}

      {/* 1. PUBLISH STUDENT FEED MODAL */}
      {isPublishModalOpen && (
        <PublishStudentFeedModal
          isOpen={isPublishModalOpen}
          onClose={() => setIsPublishModalOpen(false)}
          activity={event}
          readOnly={isOrgManagedEvent}
        />
      )}

      {/* 2. ATTENDANCE & SCANNERS MODAL */}
      {isAttendanceModalOpen && (
        <AttendanceScannersModal
          isOpen={isAttendanceModalOpen}
          onClose={() => setIsAttendanceModalOpen(false)}
          activity={event}
          readOnly={isOrgManagedEvent}
        />
      )}

      
      {/* DISBURSEMENT VOUCHER MODAL */}
      {isDisbursementVoucherModalOpen && (
        <DisbursementVoucherModal
          isOpen={isDisbursementVoucherModalOpen}
          onClose={() => setIsDisbursementVoucherModalOpen(false)}
          event={activeEvent || event}
          userProfile={{
            uid: profile?.uid,
            displayName: profile?.displayName || 'SAS Administrator',
            fullName: profile?.displayName || 'SAS Administrator',
            role: 'admin',
          }}
          userRole="admin"
          readOnly={isOrgManagedEvent}
          liquidationStatus={(activeEvent as any)?.liquidationStatus || event.liquidationStatus || fullProposal?.liquidationStatus || ''}
        />
      )}

      {/* 3. FINANCIAL LIQUIDATION MODAL */}
      {isCashModalOpen && (
        <OfficerLiquidationModal
          isOpen={isCashModalOpen}
          onClose={() => setIsCashModalOpen(false)}
          orgId={event.hostingOrgId || (event as any).organizationId || 'sao_admin'}
          orgName={event.hostingOrgName || (event as any).organizationName || 'Student Affairs'}
          userUid={profile?.uid || 'admin'}
          userName={profile?.displayName || 'SAS Administrator'}
          userRole="admin"
          isAdviser={true}
          readOnly={isOrgManagedEvent}
          initialEventId={event.id}
          initialEvent={event}
        />
      )}

      {/* Author Withdraw Modal */}
      <WithdrawConfirmModal
        isOpen={showWithdrawModal}
        onClose={() => setShowWithdrawModal(false)}
        onConfirm={handleWithdraw}
        documentType="Activity Proposal"
        documentTitle={event.title}
        isProcessing={isWithdrawing}
      />

      {/* Visual Diff Comparison Modal */}
      <RevisionDiffViewerModal
        isOpen={showDiffModal}
        onClose={() => setShowDiffModal(false)}
        documentTitle={fullProposal.title || event.title}
        documentType="AP"
        currentDocument={fullProposal}
        previousSnapshot={latestSnapshot}
        customDiffs={proposalDiffs}
        revisionNumber={fullProposal.version || ((fullProposal.versionHistory?.length || 0) + 1)}
      />
    </div>
  );
}
