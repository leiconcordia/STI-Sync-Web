import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';
import {
  ArrowLeft, X, Edit, Calendar, MapPin, Users, Shield,
  Receipt, FileText, History, Clock, CheckCircle2, AlertCircle,
  AlertTriangle, Download, Eye, Tag, Building2, Check, RotateCcw,
  XCircle, FileImage, Lock, Unlock, UserCheck, ChevronRight,
  FolderArchive, Trash2, FileSignature, Target, Wrench,
  Megaphone, ListChecks, Coins, TrendingUp, Smartphone, QrCode, DollarSign, SlidersHorizontal
} from 'lucide-react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import type { EventDocument } from '../types/event.types';
import type { FinancialLineItem } from '../../activity-proposals/types/proposal.types';
import { useOfficerProfile } from '../../../auth/hooks/useOfficerProfile';
import { useOrganizationStream } from '../../organizations/hooks/useOrganizationStream';
import { useEventTypesStream, useVenuesStream } from '../hooks/useEventConfigStream';
import { useDepartments, useCourses, useSections } from '../../academic/hooks/useAcademicStream';
import ActivitySignatoryTracker from '../../activity-proposals/components/workflow/ActivitySignatoryTracker';
import PublishStudentFeedModal from './PublishStudentFeedModal';
import AttendanceScannersModal from './AttendanceScannersModal';
import CashCustodiansModal from './CashCustodiansModal';
import { getProposalById } from '../../activity-proposals/services/proposal.service';
import { exportActivityProposalPDF } from '../../activity-proposals/utils/proposal-pdf-exporter';
import { canWithdrawProposal, canCancelEvent, isEventEditable, getEventTimingStatus, isProposalFullySigned } from '../utils/event-lifecycle.utils';
import { CancelEventModal } from './CancelEventModal';
import { ConcludeEventModal } from './ConcludeEventModal';
import { ArchiveEventModal } from './ArchiveEventModal';
import { DeleteArchivedEventModal } from './DeleteArchivedEventModal';
import { withdrawProposal } from '../services/event.service';
import { toast } from 'sonner';
import { formatAppDate, formatAppDateTime, format12HourTime } from '../../../utils/date';
import { formatPHP } from '../../activity-proposals/utils/proposal-calculations';

interface OfficerEventDetailViewProps {
  event: EventDocument;
  onClose: () => void;
  onEdit?: () => void;
}

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

const STEP_LABELS: Record<number, string> = {
  1: 'Step 1: General Info & Proponents',
  2: 'Step 2: Objectives & Mechanics',
  3: 'Step 3: Target Audience & Market',
  4: 'Step 4: Date, Venue & Schedule',
  5: 'Step 5: Committee Task Matrix',
  6: 'Step 6: Financial Projections',
  7: 'Step 7: Signatories & Vetting',
};

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

export default function OfficerEventDetailView({
  event,
  onClose,
  onEdit,
}: OfficerEventDetailViewProps) {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState('overview');
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const centerRef = useRef<HTMLDivElement | null>(null);

  // Live Event state synchronized with real-time Firestore updates
  const [liveEvent, setLiveEvent] = useState<EventDocument>(event);

  useEffect(() => {
    setLiveEvent(event);
  }, [event]);

  // Full Activity Proposal hydration (merging Form AP-01 details)
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

      // Explicit pending/review markers prevent forced approval unless fully signed
      const isExplicitPending =
        merged.proposalStatus === 'pending' ||
        merged.proposalStatus === 'pending_review' ||
        merged.proposalStatus === 'under_review' ||
        merged.status === 'under_review' ||
        merged.status === 'pending' ||
        merged.lifecycleStatus === 'pending_review';

      if (hasChain) {
        if (fullySigned) {
          merged.proposalStatus = 'approved';
          if (merged.status !== 'completed' && merged.status !== 'cancelled') {
            merged.status = 'approved';
          }
          if (merged.lifecycleStatus !== 'completed' && merged.lifecycleStatus !== 'cancelled') {
            merged.lifecycleStatus = 'approved';
          }
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

  const { profile } = useOfficerProfile();
  const { data: orgs } = useOrganizationStream();
  const { eventTypes } = useEventTypesStream();
  const { venues } = useVenuesStream();
  const { data: departments = [] } = useDepartments();
  const { data: courses = [] } = useCourses();
  const { data: sections = [] } = useSections();

  const navSections = NAV_SECTIONS;
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [isAttendanceModalOpen, setIsAttendanceModalOpen] = useState(false);
  const [isCashModalOpen, setIsCashModalOpen] = useState(false);

  const editCheck = isEventEditable(event, 'officer');
  const isEditable = editCheck.editable;

  const isSas = !event.hostingOrgId || event.hostingOrgId === 'sas';
  const orgObj = orgs.find((o) => o.id === event.hostingOrgId);
  const orgName = isSas ? 'Student Affairs & Services (SAS)' : (orgObj?.name || event.hostingOrgId || 'My Organization');
  const orgAcronym = isSas ? 'SAS' : (orgObj?.acronym || 'Club');
  const orgLogo = isSas ? null : (orgObj?.logoUrl || orgObj?.logo || null);
  const eventTypeName = eventTypes.find((t) => t.id === event.eventTypeId)?.name || 'General Activity';
  const venueObj = venues.find((v) => v.id === event.venueId);
  const venueName = venueObj ? venueObj.name : event.customVenueName || event.venueId || 'On-Campus Venue';

  const [exportingPdf, setExportingPdf] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showConcludeModal, setShowConcludeModal] = useState(false);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const withdrawCheck = canWithdrawProposal(event, 'officer');
  const isCancelled = event.isCancelled || event.lifecycleStatus === 'cancelled' || event.status === 'cancelled' || event.proposalStatus === 'cancelled';
  const cancelCheck = canCancelEvent(event, 'officer', profile?.activeOrganizationId || undefined);

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
        status: (fullProposal.status || (event.proposalStatus === 'approved' ? 'approved_president' : 'under_review')) as any,
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

  const handleWithdraw = async () => {
    if (!profile) return;
    const confirmWithdraw = window.confirm(
      `Are you sure you want to withdraw "${event.title}"? The proposal will return to Draft status so you can make revisions before SAS reviews it.`
    );
    if (!confirmWithdraw) return;

    setWithdrawing(true);
    try {
      await withdrawProposal(event.id, profile.uid, profile.studentName);
      toast.success('Proposal Withdrawn', {
        description: 'The proposal is now back in Draft status. Opening editor...',
        duration: 4000,
      });
      onClose();
      if (onEdit) {
        onEdit();
      }
    } catch (err: any) {
      toast.error('Failed to withdraw proposal', {
        description: err.message || 'Please check your connection and try again.',
      });
    } finally {
      setWithdrawing(false);
    }
  };

  const scrollTo = (id: string) => {
    setActiveSection(id);
    const el = sectionRefs.current[id];
    if (el && centerRef.current) {
      const top = el.offsetTop - 20;
      centerRef.current.scrollTo({ top, behavior: 'smooth' });
    }
  };

  // Determine if this activity was created directly by SAS / SAO Admin
  const isSasCreated = useMemo(() => {
    // 1. Explicit officer indicators take absolute precedence
    if (
      activeEvent.isOfficerProposal === true ||
      (event as any).isOfficerProposal === true ||
      fullProposal?.isOfficerProposal === true
    ) {
      return false;
    }

    const creatorRole = (
      (activeEvent as any).createdByRole ||
      (activeEvent as any).creatorRole ||
      fullProposal?.creatorRole ||
      (event as any).creatorRole ||
      (event as any).createdByRole ||
      ''
    ).toLowerCase().trim();
    if (creatorRole === 'officer' || creatorRole === 'student_officer') {
      return false;
    }

    // 2. Direct publish or direct SAS flag
    if (
      (activeEvent as any).isDirectPublished === true ||
      (activeEvent as any).isSasDirect === true ||
      (event as any).isSasDirect === true ||
      fullProposal?.isSasDirect === true
    ) {
      return true;
    }

    // 3. If an approval chain with multiple signatories exists and creator is not explicitly admin, treat as routed proposal
    const chain =
      fullProposal?.approvalChain ||
      (activeEvent as any).approvalChain ||
      (event as any).approvalChain ||
      [];
    if (chain.length > 0 && creatorRole !== 'admin' && creatorRole !== 'sas_admin' && creatorRole !== 'sao_admin') {
      return false;
    }

    if (creatorRole === 'admin' || creatorRole === 'sas' || creatorRole === 'sas_admin' || creatorRole === 'sao_admin') {
      return true;
    }

    const createdByEmail = (
      activeEvent.createdByEmail ||
      fullProposal?.createdByEmail ||
      (event as any).createdByEmail ||
      ''
    ).toLowerCase().trim();
    if (createdByEmail === 'sao@ormoc.sti.edu.ph' || createdByEmail.startsWith('sas@') || createdByEmail.startsWith('sao@')) {
      return true;
    }

    const createdByName = (
      activeEvent.createdByName ||
      fullProposal?.createdByName ||
      (event as any).createdByName ||
      ''
    ).toLowerCase().trim();
    if (createdByName === 'sao admin' || createdByName === 'sas' || createdByName.includes('student affairs & services')) {
      return true;
    }

    const hOrg = (activeEvent.hostingOrgId || (event as any).hostingOrgId || '').toLowerCase().trim();
    if ((hOrg === 'sas' || hOrg === 'sas_admin' || hOrg === 'sao' || hOrg === 'sao_admin') && chain.length === 0) {
      return true;
    }

    if (activeEvent.isOfficerProposal === false || (event as any).isOfficerProposal === false) {
      return true;
    }

    return false;
  }, [activeEvent, event, fullProposal]);

  const timing = getEventTimingStatus(activeEvent);
  const isCompleted =
    activeEvent.proposalStatus === 'completed' ||
    activeEvent.status === 'completed' ||
    ((activeEvent.proposalStatus === 'approved' || activeEvent.status === 'approved') && timing === 'completed') ||
    (activeEvent as any).isConcluded === true ||
    (activeEvent as any).isArchived === true;

  const isApproved = useMemo(() => {
    if (isCancelled) return false;
    if (isCompleted) return true;

    const chain: any[] =
      fullProposal?.approvalChain ||
      (activeEvent as any).approvalChain ||
      (event as any).approvalChain ||
      [];
    const hasChain = Array.isArray(chain) && chain.length > 0;
    const fullySigned = isProposalFullySigned(chain);

    // If an approval chain is configured, it MUST be fully signed by all signatories before considered approved
    if (hasChain) {
      return fullySigned;
    }

    // Check all candidates (activeEvent, liveEvent, original event prop, fullProposal)
    const candidates = [activeEvent, liveEvent, event, fullProposal].filter(Boolean);

    // Explicit rejection, return, or pending states NEVER count as approved
    for (const c of candidates) {
      const pStatus = ((c as any).proposalStatus || '').toLowerCase().trim();
      const st = ((c as any).status || '').toLowerCase().trim();
      const lc = ((c as any).lifecycleStatus || '').toLowerCase().trim();
      if (
        pStatus === 'rejected' ||
        st === 'rejected' ||
        pStatus === 'returned' ||
        st === 'returned' ||
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

    for (const c of candidates) {
      const pStatus = ((c as any).proposalStatus || '').toLowerCase().trim();
      const st = ((c as any).status || '').toLowerCase().trim();
      const lc = ((c as any).lifecycleStatus || '').toLowerCase().trim();

      // Direct explicit approval
      if (
        pStatus === 'approved' ||
        st === 'approved' ||
        lc === 'approved' ||
        lc === 'published' ||
        (c as any).isApproved === true ||
        Boolean((c as any).approvedAt) ||
        Boolean((c as any).approvedBy)
      ) {
        return true;
      }

      // Active campus timing or published states (only approved activities reach these states)
      if (
        st === 'upcoming' ||
        st === 'active' ||
        st === 'ongoing' ||
        st === 'published' ||
        lc === 'ongoing' ||
        lc === 'upcoming'
      ) {
        return true;
      }
    }

    // Full proposal status from signatory execution
    const fullSt = (fullProposal?.status || '').toLowerCase().trim();
    const fullPropSt = (fullProposal?.proposalStatus || '').toLowerCase().trim();
    if (fullSt === 'approved' || fullSt === 'approved_president' || fullPropSt === 'approved') {
      return true;
    }

    return false;
  }, [
    isCancelled,
    isCompleted,
    activeEvent,
    liveEvent,
    event,
    fullProposal,
  ]);

  const isAlreadyPublished = Boolean(
    (activeEvent as any).isPublished === true ||
    activeEvent.status === 'published' ||
    activeEvent.lifecycleStatus === 'published' ||
    (activeEvent as any).isDirectPublished === true
  );

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
    : isApproved
    ? 'approved'
    : (activeEvent.proposalStatus || activeEvent.status || 'draft').toLowerCase();
  const currentStatus = isApproved
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

  // Form AP-01 derived lists
  const proponentsList: string[] = useMemo(() => {
    if (fullProposal.proponents && Array.isArray(fullProposal.proponents) && fullProposal.proponents.length > 0) {
      return fullProposal.proponents;
    }
    return event.createdByName ? [event.createdByName] : ['Activity Committee'];
  }, [fullProposal.proponents, event.createdByName]);

  const organizersList: string[] = useMemo(() => {
    if (fullProposal.organizers && Array.isArray(fullProposal.organizers) && fullProposal.organizers.length > 0) {
      return fullProposal.organizers;
    }
    return [orgName];
  }, [fullProposal.organizers, orgName]);

  const objectivesList: string[] = fullProposal.objectives || event.objectives || [];
  const successIndicatorsList: string[] = fullProposal.successIndicators || [];
  const mechanicsList: string[] = fullProposal.mechanics || [];
  const materialsList: string[] = fullProposal.materials || [];
  const marketingPlanList: string[] = fullProposal.marketingPlan || [];
  const documentationPlanList: string[] = fullProposal.documentationPlan || [];
  const tasksList: any[] = fullProposal.tasks || [];
  const budgetCustodians: any[] = event.budgetCustodians || fullProposal.budgetCustodians || [];
  const totalAllocatedToCustodians = budgetCustodians.reduce((s, c) => s + (Number(c.allocatedAmount) || 0), 0);

  // Effective Approval Chain across all sources (live Firestore document, full proposal, and event prop)
  const displayApprovalChain = useMemo(() => {
    if (activeEvent?.approvalChain && Array.isArray(activeEvent.approvalChain) && activeEvent.approvalChain.length > 0) {
      return activeEvent.approvalChain;
    }
    if (fullProposal?.approvalChain && Array.isArray(fullProposal.approvalChain) && fullProposal.approvalChain.length > 0) {
      return fullProposal.approvalChain;
    }
    if ((event as any)?.approvalChain && Array.isArray((event as any).approvalChain) && (event as any).approvalChain.length > 0) {
      return (event as any).approvalChain;
    }
    return [];
  }, [activeEvent.approvalChain, fullProposal?.approvalChain, (event as any)?.approvalChain]);

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
      {/* Top Navigation Bar */}
      <header className="h-16 bg-[#001A4D] border-b border-[#0E4EBD]/30 flex items-center justify-between px-6 flex-shrink-0 z-20 shadow-md">
        <div className="flex items-center gap-4">
          <button
            onClick={onClose}
            className="flex items-center gap-2 text-white/80 hover:text-white hover:bg-white/10 px-3 py-1.5 rounded-lg transition-colors text-xs font-semibold cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Activity Management</span>
          </button>
          <div className="h-5 w-px bg-white/20" />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-[#FFD41C]">
                {fullProposal.referenceNo || event.referenceId || 'AP-2026-REF'}
              </span>
              <span className="text-white/40">·</span>
              <span className="text-white font-bold text-sm truncate max-w-[320px] lg:max-w-md">
                {fullProposal.title || event.title}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Status Badge */}
          <div className={`px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-1.5 ${currentStatus.bg}`}>
            <StatusIcon className="w-3.5 h-3.5" />
            <span>{currentStatus.label}</span>
          </div>

          {/* Export PDF Form AP-01 */}
          <button
            onClick={handleExportPDF}
            disabled={exportingPdf}
            className="px-3.5 py-1.5 bg-[#FFD41C] text-[#001A4D] hover:bg-amber-400 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
            title="Download Official STI Form AP-01 PDF"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{exportingPdf ? 'Exporting Form AP-01...' : 'Export Form AP-01'}</span>
          </button>

          {/* 1. Publish to Student App */}
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
              setIsPublishModalOpen(true);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs ${
              !isApproved
                ? 'bg-white/5 text-white/40 border border-white/10 cursor-not-allowed select-none'
                : isAlreadyPublished
                ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-500/30 cursor-not-allowed select-none opacity-90'
                : 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer active:scale-95'
            }`}
            title={
              !isApproved
                ? "Locked: Activity must achieve official approval first"
                : isAlreadyPublished
                ? "Already Published: Activity is published and live on the student mobile app"
                : "Configure mobile app feed visibility, promotional banner, and target audience"
            }
          >
            {!isApproved ? (
              <>
                <Lock className="w-3.5 h-3.5 text-amber-400/80" />
                <span>Publish to App</span>
                <span className="text-[9px] uppercase font-mono px-1 py-0.2 rounded bg-amber-400/10 text-amber-300/80 border border-amber-400/20">
                  Locked
                </span>
              </>
            ) : isAlreadyPublished ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Published to App</span>
                <span className="text-[9px] uppercase font-mono px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Published
                </span>
              </>
            ) : (
              <>
                <Smartphone className="w-3.5 h-3.5 text-sky-300" />
                <span>Publish to App</span>
              </>
            )}
          </button>

          {/* 2. Attendance & Scanners */}
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
              setIsAttendanceModalOpen(true);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs ${
              !isApproved || !isAlreadyPublished
                ? 'bg-white/5 text-white/40 border border-white/10 cursor-not-allowed select-none'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer active:scale-95'
            }`}
            title={
              !isApproved
                ? "Locked: Activity must achieve official approval first"
                : !isAlreadyPublished
                ? "Locked: Activity must be published to the mobile app first before configuring attendance & scanners"
                : "Manage QR tickets, multi-session scanning windows, and designated officers"
            }
          >
            {!isApproved ? (
              <>
                <Lock className="w-3.5 h-3.5 text-amber-400/80" />
                <span>Attendance & Scanners</span>
                <span className="text-[9px] uppercase font-mono px-1 py-0.2 rounded bg-amber-400/10 text-amber-300/80 border border-amber-400/20">
                  Locked
                </span>
              </>
            ) : !isAlreadyPublished ? (
              <>
                <Lock className="w-3.5 h-3.5 text-amber-400/80" />
                <span>Attendance & Scanners</span>
                <span className="text-[9px] uppercase font-mono px-1 py-0.2 rounded bg-amber-400/10 text-amber-300/80 border border-amber-400/20">
                  Unpublished
                </span>
              </>
            ) : (
              <>
                <QrCode className="w-3.5 h-3.5 text-indigo-200" />
                <span>Attendance & Scanners</span>
              </>
            )}
          </button>

          {/* 3. Cash Custodians */}
          <button
            type="button"
            disabled={!isApproved}
            onClick={() => {
              if (!isApproved) {
                toast.error('Locked: Proposal must be approved before allocating cash advance amounts.');
                return;
              }
              setIsCashModalOpen(true);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs ${
              isApproved
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer active:scale-95'
                : 'bg-white/5 text-white/40 border border-white/10 cursor-not-allowed select-none'
            }`}
            title={isApproved ? "Allocate cash advances per task against approved budget for physical disbursement and liquidation" : "Locked: Activity must achieve official approval first"}
          >
            {!isApproved ? (
              <>
                <Lock className="w-3.5 h-3.5 text-amber-400/80" />
                <span>Cash Custodians</span>
                <span className="text-[9px] uppercase font-mono px-1 py-0.2 rounded bg-amber-400/10 text-amber-300/80 border border-amber-400/20">
                  Locked
                </span>
              </>
            ) : (
              <>
                <Coins className="w-3.5 h-3.5 text-amber-300" />
                <span>Cash Custodians</span>
              </>
            )}
          </button>

          {/* Withdraw Proposal Action */}
          {withdrawCheck.canWithdraw && (
            <button
              onClick={handleWithdraw}
              disabled={withdrawing}
              className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
              title="Withdraw proposal to Draft status to edit"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{withdrawing ? 'Withdrawing...' : 'Withdraw Proposal'}</span>
            </button>
          )}

          {/* Revise / Edit Proposal Action */}
          {isEditable && onEdit && (
            <button
              onClick={onEdit}
              className="px-4 py-1.5 bg-[#0E4EBD] text-white hover:bg-[#1E70E8] rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
            >
              <Edit className="w-3.5 h-3.5" />
              <span>Revise / Edit Proposal</span>
            </button>
          )}

          {/* Conclude Event Action */}
          {event.proposalStatus === 'approved' && event.status !== 'completed' && !event.isArchived && (
            <button
              type="button"
              onClick={() => setShowConcludeModal(true)}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
              title="Conclude activity and lock attendance"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Conclude</span>
            </button>
          )}

          {/* Archive Event Action */}
          {(event.status === 'completed' || event.proposalStatus === 'completed' || timing === 'completed') && !event.isArchived && (
            <button
              type="button"
              onClick={() => setShowArchiveModal(true)}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
              title="Archive completed activity"
            >
              <FolderArchive className="w-3.5 h-3.5" />
              <span>Archive</span>
            </button>
          )}

          {/* Delete Action (if archived) */}
          {event.isArchived && (
            <button
              type="button"
              onClick={() => setShowDeleteModal(true)}
              className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
              title="Delete archived activity"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete</span>
            </button>
          )}

          {/* Cancel Event Action */}
          {!isCancelled && cancelCheck.canCancel && (
            <button
              type="button"
              onClick={() => setShowCancelModal(true)}
              className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
              title="Cancel this activity"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Cancel</span>
            </button>
          )}

          <button
            onClick={onClose}
            className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Layout Container */}
      <div className="flex flex-1 min-h-0">
        {/* Left Sidebar: Section Navigator */}
        <aside className="w-64 lg:w-72 flex-shrink-0 border-r border-gray-200 bg-gray-50/70 flex flex-col overflow-y-auto p-4 space-y-6">
          {/* Organization Badge */}
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

          {/* Section Navigation List (10 Sections) */}
          <div className="space-y-1">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider px-3 mb-2">
              Proposal Sections (Form AP-01)
            </p>
            {navSections.map((section) => {
              const Icon = section.icon;
              const isActive = activeSection === section.id;

              return (
                <button
                  key={section.id}
                  onClick={() => scrollTo(section.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-all text-left relative cursor-pointer ${
                    isActive
                      ? 'bg-blue-50/80 text-[#0E4EBD] shadow-xs'
                      : 'text-gray-600 hover:bg-gray-100/80 hover:text-gray-900'
                  }`}
                >
                  {isActive && (
                    <div className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-[#0E4EBD] rounded-r-full" />
                  )}
                  <Icon
                    className={`w-4 h-4 flex-shrink-0 ${
                      isActive ? 'text-[#0E4EBD]' : 'text-gray-400'
                    }`}
                  />
                  <span className="flex-1 truncate">{section.label}</span>
                </button>
              );
            })}
          </div>

          {/* Quick Notice Box */}
          <div className="p-3.5 bg-gradient-to-br from-[#001A4D] to-[#0E4EBD] rounded-xl text-white text-xs space-y-2 mt-auto shadow-xs">
            <div className="flex items-center gap-1.5 text-[#FFD41C] font-bold">
              <Shield className="w-3.5 h-3.5" />
              <span>Official Record</span>
            </div>
            <p className="text-[11px] text-white/80 leading-relaxed">
              Official STI College Ormoc Form AP-01. All approvals release operational studio controls, mobile app publishing, and budget allocations.
            </p>
          </div>
        </aside>

        {/* Center Content Pane */}
        <main ref={centerRef} className="flex-1 overflow-y-auto bg-gray-50/30 p-6 lg:p-8 space-y-8">
          {/* Status Feedback Banners */}
          {withdrawCheck.canWithdraw && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3 text-blue-900">
                <Clock className="w-5 h-5 text-blue-600 shrink-0" />
                <div>
                  <p className="text-sm font-bold">Proposal Under Review by SAS Adviser</p>
                  <p className="text-xs text-blue-800 mt-0.5">
                    This proposal is currently submitted and awaiting SAS review. Need to make revisions? You can withdraw it back to Draft status.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleWithdraw}
                disabled={withdrawing}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50 shrink-0 self-start sm:self-auto"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{withdrawing ? 'Withdrawing...' : 'Withdraw Proposal to Edit'}</span>
              </button>
            </div>
          )}

          {isCancelled && (
            <div className="p-5 bg-gradient-to-r from-red-50 to-rose-50 border-2 border-red-200 rounded-2xl shadow-xs space-y-3">
              <div className="flex items-center gap-2 text-red-800 font-bold text-base">
                <XCircle className="w-5 h-5 text-red-600" />
                <span>This Activity Has Been Cancelled</span>
              </div>
              {event.cancellationReason && (
                <div className="bg-white p-3.5 rounded-xl border border-red-100 text-xs text-red-900 leading-relaxed shadow-2xs">
                  <strong className="text-red-950">Cancellation Reason:</strong> {event.cancellationReason}
                </div>
              )}
              <div className="text-xs text-red-600 flex flex-wrap items-center gap-3">
                <span>Cancelled by: <strong className="text-red-700">{event.cancelledBy || 'Administrator / Officer'}</strong></span>
                {event.cancelledAt && <span>• {formatAppDateTime(event.cancelledAt)}</span>}
              </div>
            </div>
          )}

          {event.proposalStatus === 'returned' && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-amber-800 font-bold text-sm">
                  <RotateCcw className="w-5 h-5" />
                  <span>Proposal Returned for Revision by SAS Adviser</span>
                </div>
                {onEdit && (
                  <button
                    onClick={onEdit}
                    className="px-3.5 py-1.5 bg-[#FFC107] text-[#001A4D] hover:bg-[#F59E0B] rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <Edit className="w-3.5 h-3.5" />
                    <span>Open Editor & Revise</span>
                  </button>
                )}
              </div>
              {event.adviserRemarks && (
                <div className="bg-white p-3.5 rounded-xl border border-amber-100 text-xs text-gray-800 leading-relaxed shadow-2xs">
                  <strong className="text-amber-800">Adviser Feedback:</strong> {event.adviserRemarks}
                </div>
              )}
              {event.returnFlags && event.returnFlags.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-xs font-semibold text-amber-900">Flagged Sections to Revise:</span>
                  {event.returnFlags.map((flag, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-0.5 bg-amber-200 text-amber-900 text-xs rounded-full font-bold"
                    >
                      ⚠ {flag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {event.proposalStatus === 'rejected' && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-2xl shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-red-700 font-bold text-sm">
                  <XCircle className="w-5 h-5" />
                  <span>Proposal Rejected by SAS</span>
                </div>
              </div>

              {event.rejectionReason && (
                <p className="text-xs text-red-900 font-medium">
                  <strong>Reason Category:</strong> {event.rejectionReason}
                </p>
              )}

              {event.adviserRemarks && (
                <div className="bg-white p-3.5 rounded-xl border border-red-100 text-xs text-gray-800 leading-relaxed shadow-2xs">
                  <strong className="text-red-700">Remarks:</strong> {event.adviserRemarks}
                </div>
              )}
            </div>
          )}

          {/* SECTION 1: ACTIVITY OVERVIEW */}
          <section
            ref={(el) => { sectionRefs.current['overview'] = el; }}
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
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#0E4EBD]">
                      Official Activity Title
                    </span>
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

          {/* SECTION 2: OBJECTIVES & SUCCESS INDICATORS */}
          <section
            ref={(el) => { sectionRefs.current['objectives'] = el; }}
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

          {/* SECTION 3: OPERATIONAL UTILS & BUDGET CUSTODIANS */}
          <section
            ref={(el) => { sectionRefs.current['operations'] = el; }}
            className="space-y-4"
          >
            <SectionHeader
              title="3. Operational Setup & Budget Custodians"
              subtitle="Post-approval controls: Promotional banner, student publishing, attendance scanners, and dynamic cash allocations ('Hold Money')"
            />

            {isApproved ? (
              <div className="bg-white border border-blue-200 rounded-2xl p-6 shadow-xs space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 uppercase tracking-wider">
                        Operational Controls Unlocked
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-slate-900 mt-1">
                      Budget Custodians ("Hold Money") & Activity Operations
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Subdivide the approved budget to designated committee leads, configure mobile app publishing, and manage ticket scanners.
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
                        className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs inline-flex items-center gap-1.5 transition-all cursor-pointer"
                      >
                        <Smartphone className="w-3.5 h-3.5 text-sky-200" />
                        <span>Publishing & Banner</span>
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
                          : 'bg-indigo-600 hover:bg-indigo-700 cursor-pointer'
                      }`}
                    >
                      {!isAlreadyPublished ? (
                        <>
                          <Lock className="w-3.5 h-3.5 text-slate-500" />
                          <span>Attendance & Scanners (Locked)</span>
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
                      onClick={() => setIsCashModalOpen(true)}
                      className="px-3 py-2 bg-[#001A4D] hover:bg-[#002D72] text-[#FFD41C] text-xs font-bold rounded-xl shadow-xs inline-flex items-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Coins className="w-3.5 h-3.5 text-[#FFD41C]" />
                      <span>Allocate Cash Custodians</span>
                    </button>
                  </div>
                </div>

                {/* Custodian Summary */}
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-slate-700 uppercase tracking-wider">
                      Designated Cash Custodians ({budgetCustodians.length})
                    </span>
                    <span className="font-mono text-slate-600">
                      Total Allocated: <strong className="text-emerald-700">{formatPHP(totalAllocatedToCustodians)}</strong> / Approved: <strong className="text-[#001A4D]">{formatPHP(totalExpenseAmount)}</strong>
                    </span>
                  </div>

                  {budgetCustodians.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {budgetCustodians.map((c, i) => {
                        const isContingency = c.isContingencyFund === true;
                        return (
                          <div
                            key={c.id || i}
                            className={`p-3.5 rounded-xl space-y-1.5 border transition-all ${
                              isContingency
                                ? 'bg-amber-50/70 border-amber-300 shadow-2xs'
                                : 'bg-slate-50 border-slate-200'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-slate-900 truncate">
                                {c.personName || 'Unassigned Custodian'}
                              </span>
                              <span
                                className={`text-xs font-black font-mono ${
                                  isContingency ? 'text-amber-800' : 'text-emerald-700'
                                }`}
                              >
                                {formatPHP(c.allocatedAmount || 0)}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="text-[11px] text-slate-700 font-medium truncate">
                                {c.purpose || 'Expense Category'}
                              </p>
                              {isContingency && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider bg-amber-200/80 text-amber-900 border border-amber-300">
                                  <Shield className="w-2.5 h-2.5 text-amber-700" />
                                  Contingency
                                </span>
                              )}
                            </div>
                            {c.personRole && (
                              <p className="text-[10px] text-slate-400 truncate">
                                Role: {c.personRole}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="bg-slate-50 p-4 rounded-xl border border-dashed border-slate-200 text-center">
                      <p className="text-xs text-slate-500">
                        No cash custodians assigned yet. Click <strong>"Allocate Cash Custodians"</strong> above to allocate specific amounts to committee leads before physical disbursement and post-event liquidation.
                      </p>
                    </div>
                  )}
                </div>
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

          {/* SECTION 4: MECHANICS & MATERIALS */}
          <section
            ref={(el) => { sectionRefs.current['execution'] = el; }}
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

          {/* SECTION 5: SCHEDULE & TARGET AUDIENCE */}
          <section
            ref={(el) => { sectionRefs.current['audience_schedule'] = el; }}
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
                    Venue: <strong className="text-[#001A4D]">{venueName}</strong>
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

          {/* SECTION 6: MARKETING & DOCUMENTATION STRATEGY */}
          <section
            ref={(el) => { sectionRefs.current['strategy'] = el; }}
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

          {/* SECTION 7: COMMITTEE TASK MATRIX */}
          <section
            ref={(el) => { sectionRefs.current['tasks'] = el; }}
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

          {/* SECTION 8: OFFICIAL FINANCIAL PROJECTIONS */}
          <section
            ref={(el) => { sectionRefs.current['financials'] = el; }}
            className="space-y-4"
          >
            <SectionHeader
              title="8. Official Financial Projections (Form AP-01)"
              subtitle="Standard 6-column revenue and expenditure breakdown with projected net balance"
            />

            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xs space-y-6 p-5">
              {/* Revenues Table */}
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
                            <td className="px-3 py-2 text-right font-mono text-gray-500">{formatPHP(rev.lastYearActual || 0)}</td>
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

              {/* Expenses Table */}
              <div>
                <h4 className="text-xs font-bold text-[#001A4D] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#0E4EBD]" />
                  Projected Expenses & Materials
                </h4>
                <div className="border border-gray-200 rounded-xl overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 border-b border-gray-200 text-gray-600 font-bold uppercase">
                      <tr>
                        <th className="px-3 py-2.5 text-left w-10">#</th>
                        <th className="px-3 py-2.5 text-left">Items / Description</th>
                        <th className="px-3 py-2.5 text-right">Last Year's Actual</th>
                        <th className="px-3 py-2.5 text-right">Proposed Budget</th>
                        <th className="px-3 py-2.5 text-right font-black text-[#001A4D]">Total Amount</th>
                        <th className="px-3 py-2.5 text-left">Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {financialProjections.expenses.map((exp: any, i: number) => (
                        <tr key={exp.id || i} className="hover:bg-blue-50/20">
                          <td className="px-3 py-2.5 text-gray-400 font-mono">{i + 1}</td>
                          <td className="px-3 py-2.5 font-medium text-gray-900">{exp.description}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-gray-500">{formatPHP(exp.lastYearActual || 0)}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-gray-700">{formatPHP(exp.thisYearProposed || 0)}</td>
                          <td className="px-3 py-2.5 text-right font-mono font-bold text-[#001A4D]">{formatPHP(exp.totalAmount || 0)}</td>
                          <td className="px-3 py-2.5 text-gray-500">{exp.remarks || '—'}</td>
                        </tr>
                      ))}
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

          {/* SECTION 9: SIGNATORIES & APPROVAL PIPELINE */}
          <section
            ref={(el) => { sectionRefs.current['signatories'] = el; }}
            className="space-y-4"
          >
            <SectionHeader
              title="9. Signatory Endorsements & Executive Review"
              subtitle="Real-time multi-stage approval tracker, verified electronic signatures, and reviewer remarks"
            />
            <ActivitySignatoryTracker
              approvalChain={displayApprovalChain}
              currentStageIndex={fullProposal?.currentStageIndex || (activeEvent as any).currentStageIndex || (event as any).currentStageIndex || 1}
              proposalStatus={activeEvent.proposalStatus || event.proposalStatus}
            />
          </section>

          {/* SECTION 10: PROPOSAL HISTORY & REMARKS */}
          <section
            ref={(el) => { sectionRefs.current['history'] = el; }}
            className="space-y-4"
          >
            <SectionHeader
              title="10. Proposal History & Review Trail"
              subtitle="Chronological audit history of submissions, adviser reviews, and decisions"
            />

            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs space-y-4">
              {displayProposalHistory && displayProposalHistory.length > 0 ? (
                <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-gray-200">
                  {displayProposalHistory.map((item: any, idx: number) => {
                    const itemDate = formatAppDateTime(item.performedAt, '—');
                    const versionTag = item.versionLabel || (item.version ? `v${item.version}.0` : null);

                    return (
                      <div key={item.id || idx} className="relative space-y-1.5 text-xs">
                        <div
                          className={`absolute -left-6 top-0.5 w-4 h-4 rounded-full border-2 border-white ${
                            item.action === 'approved'
                              ? 'bg-emerald-500'
                              : item.action === 'rejected'
                              ? 'bg-red-500'
                              : item.action === 'returned'
                              ? 'bg-amber-500'
                              : item.action === 'edited' || item.action === 'resubmitted'
                              ? 'bg-[#0E4EBD]'
                              : 'bg-blue-400'
                          }`}
                        />
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-[#001A4D] uppercase tracking-wide">
                              {item.action === 'edited'
                                ? 'Edited & Updated'
                                : item.action === 'resubmitted'
                                ? 'Resubmitted Proposal'
                                : item.action === 'draft_saved'
                                ? 'Draft Saved'
                                : item.action}
                            </span>
                            {versionTag && (
                              <span className="px-2 py-0.5 bg-blue-100 text-[#0E4EBD] font-mono text-[10px] font-bold rounded-md">
                                {versionTag}
                              </span>
                            )}
                          </div>
                          <span className="text-gray-400 font-mono text-[11px]">{itemDate}</span>
                        </div>
                        {item.performedByName && (
                          <p className="text-gray-500 text-[11px]">
                            By: <strong className="text-gray-700 font-semibold">{item.performedByName}</strong>
                          </p>
                        )}
                        {item.reason && (
                          <p className="text-gray-700">
                            <strong>Reason:</strong> {item.reason}
                          </p>
                        )}
                        {item.remarks && (
                          <p className="p-2.5 bg-gray-50 rounded-lg border border-gray-200 text-gray-700 italic">
                            "{item.remarks}"
                          </p>
                        )}
                        {item.returnFlags && item.returnFlags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {item.returnFlags.map((flag: string, fIdx: number) => (
                              <span key={fIdx} className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[11px] rounded-full font-medium">
                                ⚠ {flag}
                              </span>
                            ))}
                          </div>
                        )}
                        {item.stepRemarks && Object.keys(item.stepRemarks).length > 0 && (
                          <div className="mt-2 space-y-1.5 bg-amber-50/80 border border-amber-200 rounded-xl p-3">
                            <p className="text-[11px] font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                              <span>Step-by-Step Revision Directives</span>
                            </p>
                            <div className="space-y-1.5 mt-1">
                              {Object.entries(item.stepRemarks)
                                .filter(([key]) => !isNaN(Number(key)) || key.startsWith('step_') || key.startsWith('step-') || key.startsWith('Step '))
                                .map(([key, directive]: [string, any]) => {
                                  const stepNum = Number(key.replace(/\D/g, ''));
                                  const label = STEP_LABELS[stepNum] || `Step ${stepNum || key}`;
                                  return (
                                    <div key={key} className="text-xs bg-white rounded-lg p-2.5 border border-amber-200 shadow-2xs">
                                      <span className="font-bold text-[#001A4D] block text-[11px] mb-0.5">{label}:</span>
                                      <p className="text-gray-700 text-xs leading-relaxed">{String(directive)}</p>
                                    </div>
                                  );
                                })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-gray-400 text-center py-4">No audit logs recorded yet.</p>
              )}
            </div>
          </section>
        </main>
      </div>

      {/* CANCEL EVENT MODAL */}
      {showCancelModal && (
        <CancelEventModal
          event={event}
          role="officer"
          userRole="officer"
          userId={profile?.studentId || 'officer-user'}
          userName={profile?.studentName || 'Student Officer'}
          currentOrgId={profile?.activeOrganizationId || undefined}
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
          adminUid={profile?.uid || 'officer-user'}
          adminName={profile?.studentName || 'Student Officer'}
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
          adminUid={profile?.uid || 'officer-user'}
          adminName={profile?.studentName || 'Student Officer'}
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
          adminUid={profile?.uid || 'officer-user'}
          adminName={profile?.studentName || 'Student Officer'}
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
        />
      )}

      {/* 2. ATTENDANCE & SCANNERS MODAL */}
      {isAttendanceModalOpen && (
        <AttendanceScannersModal
          isOpen={isAttendanceModalOpen}
          onClose={() => setIsAttendanceModalOpen(false)}
          activity={event}
        />
      )}

      {/* 3. CASH CUSTODIANS MODAL */}
      {isCashModalOpen && (
        <CashCustodiansModal
          isOpen={isCashModalOpen}
          onClose={() => setIsCashModalOpen(false)}
          activity={event}
          financialProjections={fullProposal?.financialProjections || (event as any).financialProjections}
        />
      )}
    </div>
  );
}
