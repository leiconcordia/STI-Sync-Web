import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import {
  Calendar,
  MapPin,
  Edit,
  Trash2,
  Plus,
  Search,
  Eye,
  Filter,
  RotateCcw,
  Clock,
  Download,
  XCircle,
  CheckCircle2,
  FileText,
  Sparkles,
  Lock,
  X
} from 'lucide-react';
import CreateProposalModal from '../../modules/activity-proposals/components/CreateProposalModal';
import { getProposalById } from '../../modules/activity-proposals/services/proposal.service';
import WithdrawConfirmModal from '../../modules/workflow/components/WithdrawConfirmModal';
import { useOfficerProfile } from '../../auth/hooks/useOfficerProfile';
import { useOrganizationStream } from '../../modules/organizations/hooks/useOrganizationStream';
import { useOrgEvents } from '../../modules/events/hooks/useEventStream';
import {
  useEventCategoriesStream,
  useVenuesStream,
} from '../../modules/events/hooks/useEventConfigStream';
import { useSemesters, useActiveAcademicPeriods } from '../../modules/academic/hooks/useAcademicStream';
import { useMiscFeeConfigs } from '../../modules/finance/hooks/useMiscFeeStream';
import {
  buildAvailableSchoolYears,
  compareActivityProposals,
  matchesRecordAcademicPeriod,
  resolveDefaultSchoolYearFilter,
  resolveUnifiedActiveAcademicTerm,
} from '../../modules/workflow/utils/table-priority-sort.utils';
import { deleteEvent, withdrawProposal } from '../../modules/events/services/event.service';
import { canWithdrawProposal, canEditProposal, isEventEditable, getEventTimingStatus, isProposalFullySigned, getSignatoryProgress } from '../../modules/events/utils/event-lifecycle.utils';
import type { EventDocument } from '../../modules/events/types/event.types';
import {
  OfficerEventDetailView,
  ConcludeEventModal,
  DeleteArchivedEventModal,
  restoreArchivedEvent,
} from '../../modules/events';
import { formatCurrency } from '../../utils/currency';
import { toast } from 'sonner';
import { TablePagination } from '../../components/common/TablePagination';
import { TrashRepositoryViewer } from '../../modules/workflow/components/TrashRepositoryViewer';
import { isSasCreatedEvent } from '../../modules/events/utils/organization-display.utils';
import {
  ORG_FUND_SOURCE_FILTER_OPTIONS,
  resolveEventFundSourceDisplay,
  type FundSourceDisplayCategory,
} from '../../modules/events/utils/fund-source-display.utils';
import {
  isDocumentForAdviserReview,
  isOfficerAuthoredRecord,
  resolveDocumentTrackingState,
} from '../../modules/activity-proposals/utils/proposal-status-tracker.utils';
import {
  useOrgSupplementalBudgets,
  SupplementalBudgetDetailModal,
  SupplementalBudgetModal,
  getEventEffectiveApprovedBudget,
  type SupplementalBudgetRequest,
} from '../../modules/supplemental-budget';

type EventStatusTab = 'all' | 'officer_proposals' | 'supplemental_budgets' | 'draft' | 'pending' | 'approved' | 'completed' | 'archived' | 'rejected' | 'returned' | 'trash';
const ITEMS_PER_PAGE = 8;

function parseDateSafe(input: any): Date | null {
  if (!input) return null;
  if (typeof input.toDate === 'function') {
    try {
      const d = input.toDate();
      return isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  }
  if (typeof input.seconds === 'number') {
    const d = new Date(input.seconds * 1000);
    return isNaN(d.getTime()) ? null : d;
  }
  if (input instanceof Date) return isNaN(input.getTime()) ? null : input;
  if (typeof input === 'string') {
    const parsed = new Date(input.trim());
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function formatShortDate(dateInput: any): string {
  const d = parseDateSafe(dateInput);
  if (!d) return 'TBD';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatSubmittedDate(dateInput: any): string {
  const d = parseDateSafe(dateInput);
  if (!d) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function getEventBudget(event: EventDocument): number {
  const effective = getEventEffectiveApprovedBudget(event);
  if (effective > 0) return effective;
  if (event.totalApprovedBudget !== undefined && event.totalApprovedBudget !== null && Number(event.totalApprovedBudget) > 0) {
    return Number(event.totalApprovedBudget);
  }
  if ((event as any).allocatedBudget !== undefined && Number((event as any).allocatedBudget) > 0) {
    return Number((event as any).allocatedBudget);
  }
  if ((event as any).totalRequestedBudget !== undefined && Number((event as any).totalRequestedBudget) > 0) {
    return Number((event as any).totalRequestedBudget);
  }
  if (Array.isArray(event.budgetItems) && event.budgetItems.length > 0) {
    return event.budgetItems.reduce((acc, item: any) => {
      const lineCost = Number(item.approvedAmount) > 0
        ? Number(item.approvedAmount)
        : (Number(item.quantity) || 0) * (Number(item.unitCost) || Number(item.cost) || 0);
      return acc + (Number(lineCost) || Number(item.totalCost) || 0);
    }, 0);
  }
  return 0;
}

function formatEventDateRange(sessions?: any[]): string {
  if (!sessions || sessions.length === 0) return 'TBD';

  const validDates = sessions
    .map((s) => parseDateSafe(s.date))
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime());

  if (validDates.length === 0) return 'TBD';

  const firstDate = validDates[0];
  const lastDate = validDates[validDates.length - 1];

  if (firstDate.toDateString() === lastDate.toDateString()) {
    return firstDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  const startMonth = firstDate.toLocaleDateString('en-US', { month: 'short' });
  const endMonth = lastDate.toLocaleDateString('en-US', { month: 'short' });
  const startDay = firstDate.getDate();
  const endDay = lastDate.getDate();
  const startYear = firstDate.getFullYear();
  const endYear = lastDate.getFullYear();

  if (startYear === endYear) {
    if (startMonth === endMonth) {
      return `${startMonth} ${startDay}-${endDay}`;
    }
    return `${startMonth} ${startDay} - ${endMonth} ${endDay}`;
  }

  return `${startMonth} ${startDay}, ${startYear} - ${endMonth} ${endDay}, ${endYear}`;
}

function getEventTimestamp(event: EventDocument): number {
  const c = parseDateSafe(event.createdAt);
  if (c) return c.getTime();
  if (event.sessions && event.sessions[0]) {
    const s = parseDateSafe(event.sessions[0].date);
    if (s) return s.getTime();
  }
  const u = parseDateSafe(event.updatedAt);
  if (u) return u.getTime();
  return 0;
}

export default function EventManagement() {
  const navigate = useNavigate();
  const [activeStatus, setActiveStatus] = useState<EventStatusTab>('all');
  const [officerSubFilter, setOfficerSubFilter] = useState<'all' | 'for_adviser_review' | 'returned' | 'forwarded' | 'rejected'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSchoolYear, setFilterSchoolYear] = useState('All');
  const [filterSemester, setFilterSemester] = useState('All');
  const [hasInitializedPeriod, setHasInitializedPeriod] = useState(false);
  const [filterCategory, setFilterCategory] = useState('All');
  const [filterVenue, setFilterVenue] = useState('All');
  const [filterFundSource, setFilterFundSource] = useState<'all' | FundSourceDisplayCategory>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const [searchParams] = useSearchParams();
  const targetId = searchParams.get('id') || searchParams.get('eventId');
  const [directEvent, setDirectEvent] = useState<EventDocument | null>(null);

  const [isApModalOpen, setIsApModalOpen] = useState(false);
  const [apInitialData, setApInitialData] = useState<any>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
  const [configuringEvent, setConfiguringEvent] = useState<EventDocument | null>(null);
  const [concludingEvent, setConcludingEvent] = useState<EventDocument | null>(null);
  const [deletingArchivedEvent, setDeletingArchivedEvent] = useState<EventDocument | null>(null);

  const { profile } = useOfficerProfile();
  const { data: orgs } = useOrganizationStream();
  const { categories = [] } = useEventCategoriesStream();
  const { venues = [] } = useVenuesStream();
  const { data: semesters = [] } = useSemesters();
  const { activeCollegePeriod, activeShsPeriod } = useActiveAcademicPeriods();
  const { configs: miscConfigs = [], activeConfig: activeMiscConfig } = useMiscFeeConfigs();
  const unifiedActiveTerm = useMemo(
    () =>
      resolveUnifiedActiveAcademicTerm({
        activeConfig: activeMiscConfig,
        configs: miscConfigs,
        activeCollegePeriod,
        activeShsPeriod,
      }),
    [activeMiscConfig, miscConfigs, activeCollegePeriod, activeShsPeriod]
  );
  const activeOrgId = profile?.activeOrganizationId || '';
  const activeOrg = orgs.find((o) => o.id === activeOrgId);
  const activeOrgName = activeOrg
    ? (activeOrg.acronym && !activeOrg.name.includes(activeOrg.acronym)
      ? `${activeOrg.name} (${activeOrg.acronym})`
      : activeOrg.name)
    : 'My Organization';
  const activeOrgAcronym = activeOrg ? activeOrg.acronym || activeOrg.name.slice(0, 4).toUpperCase() : 'ORG';
  const activeOrgLogo = activeOrg?.logoUrl || (activeOrg as any)?.logo || null;

  const isAdviser = useMemo(() => {
    if (
      profile?.isAdviser ||
      profile?.activeRoleId?.toLowerCase() === 'adviser' ||
      profile?.role?.toLowerCase() === 'adviser'
    ) {
      return true;
    }

    const cleanEmail = (profile?.email || '').trim().toLowerCase();
    const cleanUid = profile?.authUid || profile?.uid || '';
    const cleanName = (profile?.studentName || (profile as any)?.name || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');

    const checkMatch = (adv: any) => {
      if (!adv) return false;
      const advEmail = (adv.email || '').trim().toLowerCase();
      if (cleanEmail && advEmail && cleanEmail === advEmail) return true;
      const advUid = adv.authUid || adv.uid || '';
      if (cleanUid && advUid && cleanUid === advUid) return true;
      const advName = (adv.name || adv.adviserName || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      if (cleanName && advName && (cleanName === advName || cleanName.includes(advName) || advName.includes(cleanName))) return true;
      return false;
    };

    if (activeOrg && checkMatch(activeOrg.adviser)) return true;
    if (orgs && orgs.some((o: any) => checkMatch(o.adviser) || checkMatch({ name: o.adviserName, email: o.adviserEmail }))) return true;

    return false;
  }, [profile, activeOrg, orgs]);

  const { events, loading } = useOrgEvents(activeOrgId);
  const { data: orgSbrs } = useOrgSupplementalBudgets(activeOrgId);
  const [selectedSbrId, setSelectedSbrId] = useState<string | null>(null);
  const [editingSbr, setEditingSbr] = useState<SupplementalBudgetRequest | null>(null);

  const liveSelectedSbr = useMemo(
    () => (selectedSbrId ? orgSbrs.find((s) => s.id === selectedSbrId) || null : null),
    [selectedSbrId, orgSbrs]
  );

  const pendingAdviserSbrCount = useMemo(
    () => orgSbrs.filter((s) => s.status === 'for_adviser_review').length,
    [orgSbrs]
  );

  const categoryMap = useMemo(() => {
    const map = new Map<string, string>();
    categories.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [categories]);

  const venueMap = useMemo(() => {
    const map = new Map<string, string>();
    venues.forEach((v) => map.set(v.id, v.name));
    return map;
  }, [venues]);

  const handleRestoreEvent = async (event: EventDocument) => {
    try {
      await restoreArchivedEvent(event.id, profile?.uid || 'officer', profile?.studentName || 'Officer');
      toast.success(`Event "${event.title}" has been restored to active records.`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to restore event.');
    }
  };

  const isItemReturnedCheck = (e: any) =>
    e.proposalStatus === 'returned' ||
    e.proposalStatus === 'returned_for_revision' ||
    e.status === 'returned' ||
    (e as any).lifecycleStatus === 'returned' ||
    Boolean(e.isReturned) ||
    Boolean(e.stepRevisionRemarks && Object.keys(e.stepRevisionRemarks).length > 0);

  const isEventApproved = (e: EventDocument) => {
    if (e.proposalStatus === 'cancelled' || e.status === 'cancelled' || (e as any).isCancelled) return false;
    if (isItemReturnedCheck(e)) return false;
    const chain = (e as any).approvalChain || [];
    const hasChain = Array.isArray(chain) && chain.length > 0;
    if (hasChain) {
      return isProposalFullySigned(chain);
    }
    return e.proposalStatus === 'approved' || e.status === 'approved';
  };

  const isEventCompleted = (e: EventDocument) => {
    if (e.isArchived || e.isDeleted || e.proposalStatus === 'cancelled' || e.status === 'cancelled' || (e as any).isCancelled) return false;
    if (e.proposalStatus === 'completed' || e.status === 'completed' || (e as any).lifecycleStatus === 'completed') {
      return true;
    }
    if (isEventApproved(e)) {
      return getEventTimingStatus(e) === 'completed';
    }
    return false;
  };

  const isEventApprovedUpcoming = (e: EventDocument) => {
    if (e.isArchived || e.isDeleted) return false;
    if (isEventApproved(e)) {
      return getEventTimingStatus(e) !== 'completed' && e.status !== 'completed';
    }
    return false;
  };

  // Derived available school years and semesters
  const availableSchoolYears = useMemo(
    () =>
      buildAvailableSchoolYears({
        configs: miscConfigs,
        semesters,
        records: events,
        activeSchoolYear: unifiedActiveTerm.schoolYear,
      }),
    [miscConfigs, semesters, events, unifiedActiveTerm.schoolYear]
  );

  const defaultSchoolYear = useMemo(
    () =>
      resolveDefaultSchoolYearFilter({
        unifiedSchoolYear: unifiedActiveTerm.schoolYear,
        availableSchoolYears,
      }),
    [unifiedActiveTerm.schoolYear, availableSchoolYears]
  );
  const lastAutoPeriodRef = useRef<string>('');

  // Sync default filter to active/current School Year (showing all semesters in Current SY by default)
  useEffect(() => {
    if (!defaultSchoolYear) return;
    if (!hasInitializedPeriod || (lastAutoPeriodRef.current && lastAutoPeriodRef.current !== defaultSchoolYear)) {
      setFilterSchoolYear(defaultSchoolYear);
      setFilterSemester('All');
      setHasInitializedPeriod(true);
      lastAutoPeriodRef.current = defaultSchoolYear;
    } else if (!lastAutoPeriodRef.current) {
      lastAutoPeriodRef.current = defaultSchoolYear;
    }
  }, [defaultSchoolYear, hasInitializedPeriod]);

  const availableSemesters = useMemo(() => {
    const set = new Set<string>();
    semesters.forEach((s) => {
      const termName = s.semester || (s as any).term;
      if (termName) set.add(termName);
    });
    events.forEach((e) => {
      if (e.semester) set.add(e.semester);
      if ((e as any).term) set.add((e as any).term);
    });
    if (set.size === 0) {
      set.add('1st Semester');
      set.add('2nd Semester');
      set.add('1st Trimester');
      set.add('2nd Trimester');
      set.add('3rd Trimester');
      set.add('Summer');
    }
    return Array.from(set);
  }, [semesters, events]);

  // Academic Period scoped events (KPI cards, tab counts, and table share this base slice)
  const periodEvents = useMemo(
    () =>
      events.filter((event) =>
        matchesRecordAcademicPeriod({
          record: event,
          semesters,
          filterSchoolYear,
          filterSemester,
          availableSchoolYears,
          fallbackDate: event.sessions?.[0]?.date,
        })
      ),
    [events, semesters, filterSchoolYear, filterSemester, availableSchoolYears]
  );

  const statusCounts = {
    all: periodEvents.filter((e) => !e.isArchived && !e.isDeleted).length,
    officer_proposals: periodEvents.filter((e) => isDocumentForAdviserReview(e) && !e.isArchived && !e.isDeleted).length,
    officer_proposals_total: periodEvents.filter((e) => isOfficerAuthoredRecord(e) && !e.isArchived && !e.isDeleted && (e.proposalStatus !== 'draft' && e.status !== 'draft')).length,
    draft: periodEvents.filter((e) => (e.proposalStatus === 'draft' || e.status === 'draft') && !isItemReturnedCheck(e) && !isDocumentForAdviserReview(e) && !e.isDeleted).length,
    pending: periodEvents.filter((e) => (e.proposalStatus === 'pending' || e.proposalStatus === 'pending_review' || isDocumentForAdviserReview(e)) && !e.isArchived && !e.isDeleted).length,
    approved: periodEvents.filter((e) => isEventApprovedUpcoming(e)).length,
    completed: periodEvents.filter((e) => isEventCompleted(e)).length,
    archived: periodEvents.filter((e) => e.isArchived === true && !e.isDeleted).length,
    rejected: periodEvents.filter((e) => e.proposalStatus === 'rejected' && !e.isArchived && !e.isDeleted).length,
    returned: periodEvents.filter((e) => isItemReturnedCheck(e) && !e.isArchived && !e.isDeleted).length,
  };

  // Filtered & Sorted (LATEST FIRST by default; Officer Proposals pins For Adviser Review on top)
  const filteredEvents = useMemo(() => {
    return periodEvents
      .filter((event) => {
        // Soft-deleted events are sent to trash
        if (event.isDeleted) return false;

        // Archived tab isolation
        if (activeStatus === 'archived') {
          if (!event.isArchived) return false;
        } else {
          if (event.isArchived) return false;
        }

        let statusMatch = true;
        const currentStatus = (event.proposalStatus || event.status || 'draft').toLowerCase();
        const isForAdv = isDocumentForAdviserReview(event);

        const isItemReturned = currentStatus === 'returned' || event.status === 'returned' || Boolean((event as any).isReturned) || Boolean((event as any).stepRevisionRemarks && Object.keys((event as any).stepRevisionRemarks).length > 0);
        if (activeStatus === 'officer_proposals') {
          const isOfficerSub = isOfficerAuthoredRecord(event) && currentStatus !== 'draft';
          if (!isOfficerSub) {
            statusMatch = false;
          } else if (officerSubFilter === 'for_adviser_review') {
            statusMatch = isForAdv;
          } else if (officerSubFilter === 'returned') {
            statusMatch = isItemReturned;
          } else if (officerSubFilter === 'forwarded') {
            statusMatch = !isForAdv && !isItemReturned && currentStatus !== 'rejected';
          } else if (officerSubFilter === 'rejected') {
            statusMatch = currentStatus === 'rejected';
          } else {
            statusMatch = true;
          }
        } else if (activeStatus === 'draft') statusMatch = (currentStatus === 'draft' || event.status === 'draft') && !isItemReturned && !isForAdv;
        else if (activeStatus === 'pending') statusMatch = currentStatus === 'pending' || currentStatus === 'pending_review' || isForAdv;
        else if (activeStatus === 'approved') statusMatch = isEventApprovedUpcoming(event);
        else if (activeStatus === 'completed') statusMatch = isEventCompleted(event);
        else if (activeStatus === 'archived') statusMatch = event.isArchived === true;
        else if (activeStatus === 'rejected') statusMatch = currentStatus === 'rejected';
        else if (activeStatus === 'returned') statusMatch = isItemReturned;

        const q = (searchQuery || '').toLowerCase().trim();
        const titleMatch = !q || (event.title || '').toLowerCase().includes(q);
        const refMatch = (event.referenceId || '').toLowerCase().includes(q);
        const taglineMatch = (event.tagline || '').toLowerCase().includes(q);
        const creatorMatch = String((event as any).createdByName || '').toLowerCase().includes(q);
        const matchesSearch = titleMatch || refMatch || taglineMatch || creatorMatch;

        const matchesCategory = filterCategory === 'All' || event.eventCategoryId === filterCategory;
        const matchesVenue = filterVenue === 'All' || event.venueId === filterVenue;
        const matchesFundSource =
          filterFundSource === 'all' ||
          resolveEventFundSourceDisplay(event, false).category === filterFundSource;

        return statusMatch && matchesSearch && matchesCategory && matchesVenue && matchesFundSource;
      })
      .sort((a, b) => {
        if (activeStatus === 'officer_proposals') {
          const aAdv = isDocumentForAdviserReview(a) ? 1 : 0;
          const bAdv = isDocumentForAdviserReview(b) ? 1 : 0;
          if (bAdv !== aAdv) return bAdv - aAdv;
        }
        return compareActivityProposals(a, b);
      });
  }, [periodEvents, activeStatus, officerSubFilter, searchQuery, filterCategory, filterVenue, filterFundSource]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredEvents.length / ITEMS_PER_PAGE));
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredEvents.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredEvents, currentPage]);

  const handleTabChange = (tab: EventStatusTab) => {
    setActiveStatus(tab);
    setCurrentPage(1);
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterCategory, filterVenue, filterFundSource, filterSchoolYear, filterSemester]);

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to discard this draft? You can safely restore it anytime from the Trash tab.')) return;
    setDeletingId(id);
    try {
      await deleteEvent(
        id,
        {
          uid: profile?.uid || 'officer',
          name: profile?.studentName || 'Officer',
          role: 'Officer',
        },
        'Draft discarded by author'
      );
      toast.success('Event draft moved to Trash. You can restore it anytime.');
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Failed to discard event proposal.');
    } finally {
      setDeletingId(null);
    }
  };

  const [withdrawingEventTarget, setWithdrawingEventTarget] = useState<EventDocument | null>(null);

  const handleWithdraw = (event: EventDocument) => {
    if (!profile) return;
    const withdrawCheck = canWithdrawProposal(event, 'officer', profile.uid, activeOrgId);
    if (!withdrawCheck.canWithdraw) {
      toast.error('Cannot withdraw proposal', {
        description: withdrawCheck.reason || 'You do not have permission to withdraw this proposal.',
      });
      return;
    }

    setWithdrawingEventTarget(event);
  };

  const confirmWithdrawExecution = async () => {
    if (!profile || !withdrawingEventTarget) return;
    const targetEvent = withdrawingEventTarget;
    setWithdrawingId(targetEvent.id);
    try {
      await withdrawProposal(targetEvent.id, profile.uid, profile.studentName);
      toast.success('Proposal Withdrawn', {
        description: `"${targetEvent.title}" has been returned to Draft status. Opening editor...`,
      });
      setWithdrawingEventTarget(null);
      try {
        const prop = await getProposalById(targetEvent.id);
        setApInitialData(prop || { ...targetEvent, proposalStatus: 'draft', status: 'draft' });
      } catch {
        setApInitialData({ ...targetEvent, proposalStatus: 'draft', status: 'draft' });
      }
      setIsApModalOpen(true);
    } catch (err: any) {
      toast.error('Failed to withdraw proposal', {
        description: err.message || 'Please try again.',
      });
    } finally {
      setWithdrawingId(null);
    }
  };

  const handleExportCSV = () => {
    if (filteredEvents.length === 0) {
      toast.info(`No ${activeStatus === 'all' ? '' : activeStatus + ' '}events to export.`);
      return;
    }
    const headers = ['Event Title', 'Creator', 'Fund Source', 'Category', 'Event Date', 'Venue', 'Total Budget', 'Submitted', 'Status'];
    const rows = filteredEvents.map((e) => {
      const eventDate = formatEventDateRange(e.sessions);
      const venueName = venueMap.get(e.venueId || '') || e.eventFormat || 'On-Campus';
      const totalBudget = getEventBudget(e);
      const fundInfo = resolveEventFundSourceDisplay(e, false);
      const creator = (e as any).createdByName ? `${activeOrgName} (${(e as any).createdByName})` : activeOrgName;
      return [
        `"${(e.title || '').replace(/"/g, '""')}"`,
        `"${creator.replace(/"/g, '""')}"`,
        `"${fundInfo.label}"`,
        `"${categoryMap.get(e.eventCategoryId || '') || 'General'}"`,
        `"${eventDate}"`,
        `"${venueName}"`,
        `"${totalBudget}"`,
        `"${formatSubmittedDate(e.createdAt)}"`,
        `"${e.proposalStatus || 'draft'}"`,
      ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${activeOrgAcronym}_Events_${activeStatus.toUpperCase()}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`Exported ${filteredEvents.length} ${activeStatus === 'all' ? '' : activeStatus + ' '}event(s) to CSV.`);
  };

  const renderStatusBadge = (status?: string, event?: EventDocument) => {
    if (event && isEventCompleted(event)) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200/80">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
          Completed
        </span>
      );
    }

    if (event?.isDeleted) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200/80">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
          Soft Deleted
        </span>
      );
    }

    if (event?.isArchived) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-300">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
          Archived
        </span>
      );
    }

    switch (status) {
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Approved
          </span>
        );
      case 'pending':
      case 'pending_review':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200/80">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            Pending Review
          </span>
        );
      case 'returned':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-300">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />
            Returned
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200/80">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
            Rejected
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200/80">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
            Completed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-200">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
            Draft
          </span>
        );
    }
  };

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam && ['all', 'officer_proposals', 'supplemental_budgets', 'draft', 'pending', 'approved', 'completed', 'archived', 'rejected', 'returned', 'trash'].includes(tabParam)) {
      setActiveStatus(tabParam as EventStatusTab);
      setCurrentPage(1);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!targetId) return;
    const target = events.find((e) => e.id === targetId);
    if (target) {
      setSelectedEventId(target.id);
    } else if (!loading) {
      getProposalById(targetId).then((fetched) => {
        if (fetched) {
          setDirectEvent(fetched as any);
          setSelectedEventId(fetched.id);
        }
      }).catch(() => { });
    }
  }, [targetId, events, loading]);

  const selectedEvent = events.find((e) => e.id === selectedEventId) || directEvent;

  return (
    <div className="space-y-5 w-full">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#001A4D] tracking-tight">
            Activity Management
          </h1>
          <p className="text-gray-500 text-xs font-medium mt-0.5">
            Plan, submit, and track official student organization activities and proposals
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <button
            onClick={() => {
              setApInitialData(null);
              setIsApModalOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#0E4EBD] hover:bg-[#0A3D96] text-white rounded-xl text-sm font-bold transition-colors shadow-xs cursor-pointer"
            title={isAdviser ? "Create an official Activity Proposal as Organization Adviser" : "Create an Activity Proposal and submit to your Club Adviser for checking and endorsement"}
          >
            <FileText className="w-4 h-4 text-[#FFD41C]" />
            Create Activity Proposal
          </button>
        </div>
      </div>

      {/* ── Metric Summary Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Pending Card */}
        <div
          onClick={() => handleTabChange('pending')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer relative overflow-hidden group shadow-xs ${activeStatus === 'pending'
            ? 'bg-gradient-to-br from-amber-500 to-amber-600 text-white border-amber-600 ring-2 ring-amber-400/30 shadow-md'
            : 'bg-white border-gray-200 hover:border-amber-300 hover:shadow-sm'
            }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className={`text-xs font-bold uppercase tracking-wider ${activeStatus === 'pending' ? 'text-amber-100' : 'text-gray-500'}`}>
              Pending Review
            </span>
            <div className={`p-2 rounded-xl ${activeStatus === 'pending' ? 'bg-white/20 text-white' : 'bg-amber-50 text-amber-700'}`}>
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className={`text-2xl font-black mb-1 ${activeStatus === 'pending' ? 'text-white' : 'text-gray-900'}`}>
            {loading ? '...' : statusCounts.pending}
          </div>
          <div className="flex items-center justify-between">
            <span className={`text-[11px] font-medium ${activeStatus === 'pending' ? 'text-amber-100' : 'text-amber-700'}`}>
              Awaiting SAO Action
            </span>
          </div>
        </div>

        {/* Approved Card */}
        <div
          onClick={() => handleTabChange('approved')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer relative overflow-hidden group shadow-xs ${activeStatus === 'approved'
            ? 'bg-gradient-to-br from-emerald-600 to-emerald-700 text-white border-emerald-700 ring-2 ring-emerald-400/30 shadow-md'
            : 'bg-white border-gray-200 hover:border-emerald-300 hover:shadow-sm'
            }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className={`text-xs font-bold uppercase tracking-wider ${activeStatus === 'approved' ? 'text-emerald-100' : 'text-gray-500'}`}>
              Approved
            </span>
            <div className={`p-2 rounded-xl ${activeStatus === 'approved' ? 'bg-white/20 text-white' : 'bg-emerald-50 text-emerald-600'}`}>
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className={`text-2xl font-black mb-1 ${activeStatus === 'approved' ? 'text-white' : 'text-gray-900'}`}>
            {loading ? '...' : statusCounts.approved}
          </div>
          <div className="flex items-center justify-between">
            <span className={`text-[11px] font-medium ${activeStatus === 'approved' ? 'text-emerald-100' : 'text-emerald-600'}`}>
              Active &amp; Scheduled
            </span>
          </div>
        </div>

        {/* Completed Card */}
        <div
          onClick={() => handleTabChange('completed')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer relative overflow-hidden group shadow-xs ${activeStatus === 'completed'
            ? 'bg-gradient-to-br from-blue-600 to-blue-700 text-white border-blue-700 ring-2 ring-blue-400/30 shadow-md'
            : 'bg-white border-gray-200 hover:border-blue-300 hover:shadow-sm'
            }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className={`text-xs font-bold uppercase tracking-wider ${activeStatus === 'completed' ? 'text-blue-100' : 'text-gray-500'}`}>
              Completed
            </span>
            <div className={`p-2 rounded-xl ${activeStatus === 'completed' ? 'bg-white/20 text-white' : 'bg-blue-50 text-blue-600'}`}>
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className={`text-2xl font-black mb-1 ${activeStatus === 'completed' ? 'text-white' : 'text-gray-900'}`}>
            {loading ? '...' : statusCounts.completed}
          </div>
          <div className="flex items-center justify-between">
            <span className={`text-[11px] font-medium ${activeStatus === 'completed' ? 'text-blue-100' : 'text-blue-600'}`}>
              Concluded Events
            </span>
          </div>
        </div>

        {/* Rejected Card */}
        <div
          onClick={() => handleTabChange('rejected')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer relative overflow-hidden group shadow-xs ${activeStatus === 'rejected'
            ? 'bg-gradient-to-br from-rose-600 to-red-700 text-white border-rose-700 ring-2 ring-rose-400/30 shadow-md'
            : 'bg-white border-gray-200 hover:border-rose-300 hover:shadow-sm'
            }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className={`text-xs font-bold uppercase tracking-wider ${activeStatus === 'rejected' ? 'text-rose-100' : 'text-gray-500'}`}>
              Rejected
            </span>
            <div className={`p-2 rounded-xl ${activeStatus === 'rejected' ? 'bg-white/20 text-white' : 'bg-rose-50 text-rose-600'}`}>
              <XCircle className="w-4 h-4" />
            </div>
          </div>
          <div className={`text-2xl font-black mb-1 ${activeStatus === 'rejected' ? 'text-white' : 'text-gray-900'}`}>
            {loading ? '...' : statusCounts.rejected}
          </div>
          <div className="flex items-center justify-between">
            <span className={`text-[11px] font-medium ${activeStatus === 'rejected' ? 'text-rose-100' : 'text-rose-600'}`}>
              Declined Proposals
            </span>
          </div>
        </div>
      </div>

      {/* ── Main Container: Tabs + Search + Fixed Height Table + Pagination ── */}
      <div className="bg-white border border-[#E5E7EB] rounded-2xl shadow-xs overflow-hidden">
        {/* Top Control Bar */}
        <div className="p-4 border-b border-gray-100 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Status Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
            {[
              { key: 'all', label: 'All', count: statusCounts.all },
              {
                key: 'officer_proposals',
                label: 'Officer Proposals',
                count: statusCounts.officer_proposals > 0 ? statusCounts.officer_proposals : statusCounts.officer_proposals_total,
                highlight: statusCounts.officer_proposals > 0,
              },
              {
                key: 'supplemental_budgets',
                label: 'Supplemental Budgets',
                count: pendingAdviserSbrCount > 0 ? pendingAdviserSbrCount : orgSbrs.length,
                highlight: isAdviser && pendingAdviserSbrCount > 0,
              },
              { key: 'pending', label: 'In Review', count: statusCounts.pending },
              { key: 'approved', label: 'Approved', count: statusCounts.approved },
              { key: 'returned', label: 'For Revision', count: statusCounts.returned },
              { key: 'completed', label: 'Completed', count: statusCounts.completed },
              { key: 'rejected', label: 'Rejected', count: statusCounts.rejected },
              { key: 'draft', label: 'Drafts', count: statusCounts.draft },
              { key: 'archived', label: 'Archived', count: statusCounts.archived },
              { key: 'trash', label: 'Trash', count: undefined },
            ].map((tab: any) => {
              const isActive = activeStatus === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => handleTabChange(tab.key as EventStatusTab)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${isActive
                    ? 'bg-[#001A4D] text-white shadow-xs'
                    : tab.highlight
                    ? 'bg-indigo-50 text-indigo-800 border border-indigo-200 hover:bg-indigo-100'
                    : 'bg-gray-100/80 text-gray-600 hover:bg-gray-200/80 hover:text-gray-900'
                    }`}
                >
                  <span>{tab.label}</span>
                  {tab.count !== undefined && (
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[11px] font-bold ${isActive
                        ? 'bg-white/20 text-white'
                        : tab.highlight
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-200/80 text-gray-700'
                        }`}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-2">
            {/* Search Input */}
            <div className="relative flex-1 sm:w-60">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search events..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-gray-50/80 border border-gray-200 rounded-xl text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#001A4D]/10 focus:border-[#001A4D]"
              />
            </div>

            {/* Filter Toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors flex items-center gap-1.5 cursor-pointer ${showFilters || filterCategory !== 'All' || filterVenue !== 'All' || filterFundSource !== 'all' || filterSchoolYear !== (defaultSchoolYear || 'All') || filterSemester !== 'All'
                ? 'border-[#001A4D] bg-[#001A4D]/5 text-[#001A4D]'
                : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                }`}
            >
              <Filter className="w-3.5 h-3.5" />
              <span>Filter</span>
            </button>

            {/* Export Button */}
            <button
              onClick={handleExportCSV}
              className="px-3 py-1.5 rounded-xl text-xs font-bold border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-1.5 cursor-pointer"
              title="Export events to CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export</span>
            </button>
          </div>
        </div>

        {/* Officer Proposals Sub-Filter Bar */}
        {activeStatus === 'officer_proposals' && (
          <div className="px-4 py-2.5 bg-indigo-50/60 border-b border-indigo-100 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-900">
                Officer Proposals Queue:
              </span>
              {[
                { key: 'all', label: 'All Submitted' },
                { key: 'for_adviser_review', label: `For Adviser Review (${statusCounts.officer_proposals})` },
                { key: 'returned', label: 'For Revision' },
                { key: 'forwarded', label: 'Approved by Adviser / Forwarded' },
                { key: 'rejected', label: 'Rejected' },
              ].map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => {
                    setOfficerSubFilter(chip.key as any);
                    setCurrentPage(1);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                    officerSubFilter === chip.key
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'bg-white text-indigo-900 border border-indigo-200 hover:bg-indigo-100/70'
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>
            <span className="text-[11px] text-indigo-800/80 font-medium">
              {isAdviser
                ? 'Click "Review & Decide" on any pending officer proposal to approve & forward, return for revision, or reject.'
                : 'Track your submissions awaiting Club Adviser review before forwarding to SAS.'}
            </span>
          </div>
        )}

        {/* Filter Drawer */}
        {showFilters && (
          <div className="p-4 bg-gray-50/60 border-b border-gray-200 flex flex-wrap items-center gap-3 text-xs">
            {/* School Year Filter */}
            <div>
              <span className="text-gray-500 font-semibold mr-1.5">School Year:</span>
              <select
                value={filterSchoolYear}
                onChange={(e) => setFilterSchoolYear(e.target.value)}
                className="px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-800 outline-none focus:border-[#001A4D]"
              >
                <option value="All">All School Years</option>
                {availableSchoolYears.map((sy) => (
                  <option key={sy} value={sy}>
                    A.Y. {sy} {unifiedActiveTerm.schoolYear === sy ? '• Current SY' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Semester Filter */}
            <div>
              <span className="text-gray-500 font-semibold mr-1.5">Semester:</span>
              <select
                value={filterSemester}
                onChange={(e) => setFilterSemester(e.target.value)}
                className="px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-800 outline-none focus:border-[#001A4D]"
              >
                <option value="All">All Semesters</option>
                {availableSemesters.map((term) => (
                  <option key={term} value={term}>
                    {term} {unifiedActiveTerm.semester === term ? '• Active Term' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <span className="text-gray-500 font-semibold mr-1.5">Fund Source:</span>
              <select
                value={filterFundSource}
                onChange={(e) => setFilterFundSource(e.target.value as 'all' | FundSourceDisplayCategory)}
                className="px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-800 outline-none focus:border-[#001A4D]"
              >
                <option value="all">All Fund Sources</option>
                {ORG_FUND_SOURCE_FILTER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <span className="text-gray-500 font-semibold mr-1.5">Category:</span>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-800 outline-none focus:border-[#001A4D]"
              >
                <option value="All">All Categories</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <span className="text-gray-500 font-semibold mr-1.5">Venue:</span>
              <select
                value={filterVenue}
                onChange={(e) => setFilterVenue(e.target.value)}
                className="px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-800 outline-none focus:border-[#001A4D]"
              >
                <option value="All">All Venues</option>
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>

            {(filterCategory !== 'All' || filterVenue !== 'All' || filterFundSource !== 'all' || filterSchoolYear !== (defaultSchoolYear || 'All') || filterSemester !== 'All') && (
              <button
                onClick={() => {
                  setFilterSchoolYear(defaultSchoolYear || 'All');
                  setFilterSemester('All');
                  setFilterCategory('All');
                  setFilterVenue('All');
                  setFilterFundSource('all');
                }}
                className="text-xs text-red-600 hover:text-red-700 font-semibold flex items-center gap-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                Reset to Current SY
              </button>
            )}
          </div>
        )}

        {activeStatus === 'supplemental_budgets' ? (
          <div className="p-4">
            {orgSbrs.length === 0 ? (
              <div className="py-12 text-center text-sm text-gray-500">
                No Supplemental Budget Requests yet. Open any <strong>Approved</strong> event prior to implementation and click <strong>Request Additional Funds</strong> inside Section 8 (Financial Projections).
              </div>
            ) : (
              <div className="overflow-x-auto border border-gray-200 rounded-xl">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 uppercase text-[11px]">
                    <tr>
                      <th className="text-left px-4 py-3 font-bold">Ref / Activity</th>
                      <th className="text-left px-4 py-3 font-bold">Funding Source</th>
                      <th className="text-right px-4 py-3 font-bold">Base → New Budget</th>
                      <th className="text-left px-4 py-3 font-bold">Status</th>
                      <th className="text-right px-4 py-3 font-bold">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {orgSbrs
                      .filter((s) => {
                        if (!searchQuery.trim()) return true;
                        const q = searchQuery.toLowerCase();
                        return (
                          s.referenceCode.toLowerCase().includes(q) ||
                          s.eventTitle.toLowerCase().includes(q) ||
                          s.creatorName.toLowerCase().includes(q)
                        );
                      })
                      .map((sbr) => {
                        const track = resolveDocumentTrackingState(sbr, 'SBR');
                        return (
                          <tr
                            key={sbr.id}
                            onClick={() => setSelectedSbrId(sbr.id)}
                            className="hover:bg-blue-50/30 cursor-pointer"
                          >
                            <td className="px-4 py-3">
                              <div className="font-mono font-bold text-[#001A4D]">{sbr.referenceCode}</div>
                              <div className="font-semibold text-gray-900">{sbr.eventTitle}</div>
                              <div className="text-[11px] text-gray-500">By {sbr.creatorName}</div>
                            </td>
                            <td className="px-4 py-3 font-medium text-gray-700">
                              {sbr.fundingSource === 'organization_funds'
                                ? 'Club Treasury'
                                : 'School Budget (Misc Fee)'}
                            </td>
                            <td className="px-4 py-3 text-right font-mono">
                              <div className="font-bold text-amber-700">+{formatCurrency(sbr.requestedAmount)}</div>
                              <div className="text-[11px] text-gray-500">
                                Base {formatCurrency(sbr.baseApprovedBudget)}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${track.badgeClass}`}>
                                {sbr.status === 'withdrawn' ? 'Withdrawn' : track.label}
                              </span>
                              {track.subLabel && (
                                <div className="text-[10px] text-gray-500 mt-0.5">{track.subLabel}</div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedSbrId(sbr.id);
                                }}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                                  isAdviser && sbr.status === 'for_adviser_review'
                                    ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                                    : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                                }`}
                              >
                                {isAdviser && sbr.status === 'for_adviser_review'
                                  ? 'Review & Decide'
                                  : 'Inspect'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : activeStatus === 'trash' ? (
          <div className="p-4">
            <TrashRepositoryViewer
              collectionName="activities"
              documentTypeLabel="Activity Proposals & Events"
              organizationId={activeOrgId}
              currentUser={{
                uid: profile?.uid || 'officer',
                name: profile?.studentName || 'Officer',
                role: 'Officer',
              }}
            />
          </div>
        ) : (
          <>
            {/* ── Table Container (No inner vertical scroll) ── */}
            <div className="overflow-x-auto relative">
              {loading ? (
                <div className="h-full flex items-center justify-center text-sm text-gray-500">
                  Loading activities...
                </div>
              ) : filteredEvents.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-2">
                  <Calendar className="w-12 h-12 text-gray-300 mx-auto" />
                  <div className="font-bold text-gray-700 text-sm">No activities found</div>
                  <p className="text-xs text-gray-400 max-w-sm">
                    No activities match the selected status or search filter. Click "New Activity Proposal" to get started.
                  </p>
                </div>
              ) : (
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-gray-50/90 text-gray-500 font-bold uppercase tracking-wider text-[11px] border-b border-gray-200 sticky top-0 z-10 backdrop-blur-xs">
                    <tr>
                      <th className="py-3 px-4">Activity & Reference</th>
                      <th className="py-3 px-4">Creator</th>
                      <th className="py-3 px-4">Fund Source</th>
                      <th className="py-3 px-4">Schedule & Venue</th>
                      <th className="py-3 px-4">Budget</th>
                      <th className="py-3 px-4">Signatory Stage</th>
                      <th className="py-3 px-4 text-center">Signatory Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-gray-700 font-normal">
                    {paginatedItems.map((event) => {
                      const venueName = venueMap.get(event.venueId || '') || (event as any).customVenueName || event.eventFormat || 'On-Campus';
                      const totalBudget = getEventBudget(event);
                      const eventDateRange = formatEventDateRange(event.sessions);

                      const isRejected = event.proposalStatus === 'rejected';
                      const isReturned = event.proposalStatus === 'returned' || event.status === 'returned' || Boolean((event as any).isReturned) || Boolean((event as any).stepRevisionRemarks && Object.keys((event as any).stepRevisionRemarks).length > 0);
                      const isDraft = (event.proposalStatus === 'draft' || event.status === 'draft') && !isReturned;
                      const isApproved = isEventApproved(event);
                      const isAP = Boolean((event as any).isActivityProposal || (event as any).referenceId?.startsWith('AP-'));

                      const fundInfo = resolveEventFundSourceDisplay(event, false);
                      const creatorName = String((event as any).createdByName || '').trim();

                      const currentStep = (event as any).approvalChain?.find((s: any) => s.status === 'current');
                      const sigProgress = getSignatoryProgress(event);
                      const currentStageIdx = (event as any).currentStageIndex || 1;

                      return (
                        <tr key={event.id} className="hover:bg-slate-50/80 transition-colors">
                          {/* Activity & Reference */}
                          <td className="py-3.5 px-4 max-w-[240px]">
                            <div className="font-bold text-gray-900 text-sm leading-snug truncate flex items-center gap-1.5">
                              {isAP && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200 uppercase tracking-wider flex-shrink-0">
                                  Proposal
                                </span>
                              )}
                              <span className="truncate">{event.title}</span>
                            </div>
                            {event.tagline && (
                              <div className="text-[11px] text-[#0E4EBD] italic truncate mt-0.5 font-medium">
                                "{event.tagline}"
                              </div>
                            )}
                            {(isRejected || isReturned) && (event.rejectionReason || (event as any).adviserRemarks) ? (
                              <div className="text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 font-medium truncate mt-1">
                                Note: {event.rejectionReason || (event as any).adviserRemarks}
                              </div>
                            ) : event.referenceId ? (
                              <div className="text-[11px] text-gray-400 font-mono mt-0.5">
                                Ref: {event.referenceId}
                              </div>
                            ) : null}
                          </td>

                          {/* Creator */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-2">
                              {activeOrgLogo ? (
                                <img
                                  src={activeOrgLogo}
                                  alt={activeOrgName}
                                  className="w-6 h-6 rounded-full object-contain border border-gray-200 bg-white p-0.5 flex-shrink-0"
                                />
                              ) : (
                                <div className="w-6 h-6 rounded-full bg-[#001A4D] text-white font-bold text-[10px] flex items-center justify-center flex-shrink-0">
                                  {activeOrgName.slice(0, 2).toUpperCase()}
                                </div>
                              )}
                              <div className="min-w-0">
                                <div className="font-bold text-gray-800 text-xs truncate max-w-[140px]">
                                  {activeOrgName}
                                </div>
                                {creatorName && creatorName.toLowerCase() !== activeOrgName.toLowerCase() && (
                                  <div className="text-[11px] text-gray-500 font-medium truncate max-w-[140px]">
                                    {creatorName}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Fund Source */}
                          <td className="py-3.5 px-4">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold border ${fundInfo.badgeClass}`}>
                              {fundInfo.label}
                            </span>
                            <div className="text-[11px] text-gray-500 font-medium truncate max-w-[160px] mt-0.5">
                              {fundInfo.detail}
                            </div>
                          </td>

                          {/* Schedule & Venue */}
                          <td className="py-3.5 px-4 text-gray-600 whitespace-nowrap">
                            <div className="flex items-center gap-1.5 font-medium">
                              <Calendar className="w-3.5 h-3.5 text-gray-400" />
                              <span>{eventDateRange}</span>
                            </div>
                            <div className="flex items-center gap-1 text-[11px] text-gray-500 max-w-[150px] truncate mt-0.5">
                              <MapPin className="w-3 h-3 text-gray-400 flex-shrink-0" />
                              <span className="truncate">{venueName}</span>
                            </div>
                          </td>

                          {/* Budget */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            {isApproved ? (
                              <>
                                <div className="font-extrabold text-emerald-700 text-sm">
                                  {formatCurrency(totalBudget)}
                                </div>
                                <span className="text-[10px] uppercase font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                  Approved
                                </span>
                              </>
                            ) : (
                              <>
                                <div className="font-bold text-gray-700 text-sm">
                                  {formatCurrency(totalBudget)}
                                </div>
                                <span className="text-[10px] uppercase font-semibold text-gray-400">
                                  Proposed
                                </span>
                              </>
                            )}
                          </td>

                          {/* Proposal Status (7-Stage Tracker Badge) */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            {(() => {
                              const track = resolveDocumentTrackingState(event, 'AP');
                              return (
                                <div className="inline-flex flex-col items-start gap-0.5">
                                  <span
                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${track.badgeClass}`}
                                  >
                                    <span
                                      className={`w-1.5 h-1.5 rounded-full ${track.dotClass} ${
                                        track.isPulsing ? 'animate-pulse' : ''
                                      }`}
                                    />
                                    {track.label}
                                  </span>
                                  {track.subLabel && (
                                    <span className="text-[10px] text-gray-500 font-medium pl-1">
                                      {track.subLabel}
                                    </span>
                                  )}
                                </div>
                              );
                            })()}
                          </td>

                          {/* Signatory Status (e.g. 3/5) */}
                          <td className="py-3.5 px-4 text-center whitespace-nowrap">
                            {sigProgress.totalCount > 0 ? (
                              <div className="inline-flex flex-col items-center justify-center">
                                <span
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border shadow-2xs ${sigProgress.isComplete
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : isRejected
                                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                                      : isReturned
                                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                                        : 'bg-blue-50 text-[#001A4D] border-blue-200'
                                    }`}
                                  title={`${sigProgress.signedCount} of ${sigProgress.totalCount} signatories have signed`}
                                >
                                  {sigProgress.isComplete ? (
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                                  ) : (
                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse flex-shrink-0" />
                                  )}
                                  <span className="font-mono font-black">{sigProgress.ratioText}</span>
                                </span>
                                <span className="text-[10px] text-gray-500 font-medium mt-0.5">
                                  {sigProgress.isComplete
                                    ? 'Fully Signed'
                                    : `${sigProgress.signedCount} of ${sigProgress.totalCount} signed`}
                                </span>
                              </div>
                            ) : isApproved ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                <span>Signed</span>
                              </span>
                            ) : (
                              <span className="text-gray-400 text-xs font-mono font-medium">—</span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Club Adviser Review CTA when awaiting adviser decision */}
                              {isAdviser && isDocumentForAdviserReview(event) && !event.isArchived ? (
                                <button
                                  onClick={() => setSelectedEventId(event.id)}
                                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1 cursor-pointer shadow-xs"
                                  title="Open Club Adviser Decision Panel"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>Review &amp; Decide</span>
                                </button>
                              ) : (
                                <button
                                  onClick={() => setSelectedEventId(event.id)}
                                  className="px-2.5 py-1.5 bg-gray-100 hover:bg-[#001A4D] hover:text-white text-gray-700 rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1 cursor-pointer"
                                  title="View Activity Proposal"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>View</span>
                                </button>
                              )}

                              {/* Lifecycle Actions */}
                              {event.isArchived ? (
                                <>
                                  <button
                                    onClick={() => handleRestoreEvent(event)}
                                    className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1 cursor-pointer"
                                    title="Restore Event to Active Records"
                                  >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                    <span>Restore</span>
                                  </button>
                                  <button
                                    onClick={() => setDeletingArchivedEvent(event)}
                                    className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1 cursor-pointer"
                                    title="Delete Archived Event (Move to Trash)"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>Delete</span>
                                  </button>
                                </>
                              ) : (
                                <>
                                  {/* Under Review: Withdraw (allowed until 1st signatory signs, or SAS signs for org funds) */}
                                  {canWithdrawProposal(event, 'officer', profile?.uid, activeOrgId).canWithdraw && (
                                    <button
                                      onClick={() => handleWithdraw(event)}
                                      disabled={withdrawingId === event.id}
                                      className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                      title="Withdraw Proposal to Draft"
                                    >
                                      <RotateCcw className="w-3.5 h-3.5" />
                                      <span>{withdrawingId === event.id ? '...' : 'Withdraw'}</span>
                                    </button>
                                  )}

                                  {/* Returned for Revision: View + Edit */}
                                  {isReturned && canEditProposal(event, 'officer', profile?.uid, activeOrgId).canEdit && (
                                    <button
                                      onClick={async () => {
                                        try {
                                          const prop = await getProposalById(event.id);
                                          setApInitialData(prop || event);
                                        } catch {
                                          setApInitialData(event);
                                        }
                                        setIsApModalOpen(true);
                                      }}
                                      className="px-2.5 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1 cursor-pointer shadow-xs"
                                      title="Revise Returned Proposal Draft for Adviser Re-Endorsement"
                                    >
                                      <Edit className="w-3.5 h-3.5" />
                                      <span>Revise Draft</span>
                                    </button>
                                  )}

                                  {/* Draft: Edit + Delete */}
                                  {isDraft && canEditProposal(event, 'officer', profile?.uid, activeOrgId).canEdit && (
                                    <>
                                      <button
                                        onClick={async () => {
                                          try {
                                            const prop = await getProposalById(event.id);
                                            setApInitialData(prop || event);
                                          } catch {
                                            setApInitialData(event);
                                          }
                                          setIsApModalOpen(true);
                                        }}
                                        className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-[#001A4D] border border-blue-200 rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1 cursor-pointer"
                                        title="Edit Draft Proposal"
                                      >
                                        <Edit className="w-3.5 h-3.5" />
                                        <span>Edit Draft</span>
                                      </button>
                                      <button
                                        onClick={() => handleDelete(event.id)}
                                        disabled={deletingId === event.id}
                                        className="p-1.5 hover:bg-red-50 text-red-600 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                                        title="Delete Proposal"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </>
                                  )}

                                  {/* Rejected: View + Delete */}
                                  {isRejected && (
                                    <button
                                      onClick={() => handleDelete(event.id)}
                                      disabled={deletingId === event.id}
                                      className="p-1.5 hover:bg-red-50 text-red-600 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                                      title="Delete Proposal"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}

                                  {/* Approved Lifecycle: Conclude */}
                                  {isApproved && event.status !== 'completed' && !isSasCreatedEvent(event) && (
                                    <button
                                      onClick={() => setConcludingEvent(event)}
                                      className="px-2.5 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200 rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1 cursor-pointer"
                                      title="Conclude Event & Lock Attendance"
                                    >
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                      <span>Conclude</span>
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* ── Bottom Pagination Bar ── */}
            <TablePagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={filteredEvents.length}
              itemsPerPage={ITEMS_PER_PAGE}
              onPageChange={setCurrentPage}
              itemName="activities"
            />
          </>
        )}
      </div>

      {/* Official 7-Step Activity Proposal (AP) Wizard Modal */}
      {isApModalOpen && (
        <CreateProposalModal
          isOpen={isApModalOpen}
          onClose={() => {
            setIsApModalOpen(false);
            setApInitialData(null);
          }}
          initialData={apInitialData ?? undefined}
          currentUser={{
            uid: profile?.uid || profile?.authUid || 'officer-user',
            name: profile?.studentName || (isAdviser ? 'Club Adviser' : 'Student Officer'),
            email: profile?.email || '',
            role: isAdviser ? 'adviser' : 'officer',
            isAdviser: isAdviser,
            organizationId: activeOrgId,
            organizationName: activeOrgName,
            signatureUrl: profile?.signatureUrl || null,
          }}
        />
      )}

      {/* Conclude Event Modal */}
      {concludingEvent && (
        <ConcludeEventModal
          isOpen={!!concludingEvent}
          onClose={() => setConcludingEvent(null)}
          event={concludingEvent}
          adminUid={profile?.uid || 'officer-user'}
          adminName={profile?.studentName || 'Student Officer'}
        />
      )}

      {/* Delete Archived Event Modal */}
      {deletingArchivedEvent && (
        <DeleteArchivedEventModal
          isOpen={!!deletingArchivedEvent}
          onClose={() => setDeletingArchivedEvent(null)}
          event={deletingArchivedEvent}
          adminUid={profile?.uid || 'officer-user'}
          adminName={profile?.studentName || 'Student Officer'}
        />
      )}

      {/* Rich Officer Event Detail View */}
      {selectedEvent && (
        <OfficerEventDetailView
          event={selectedEvent}
          onClose={() => {
            setSelectedEventId(null);
            setDirectEvent(null);
            if (targetId) {
              const next = new URLSearchParams(searchParams);
              next.delete('id');
              next.delete('eventId');
              const qs = next.toString();
              navigate(qs ? `?${qs}` : `?tab=${activeStatus}`, { replace: true });
            }
          }}
          onEdit={async () => {
            try {
              const prop = await getProposalById(selectedEvent.id);
              setApInitialData(prop || selectedEvent);
            } catch {
              setApInitialData(selectedEvent);
            }
            setSelectedEventId(null);
            setDirectEvent(null);
            setIsApModalOpen(true);
          }}
        />
      )}

      {/* Withdraw Confirmation Modal */}
      <WithdrawConfirmModal
        isOpen={Boolean(withdrawingEventTarget)}
        onClose={() => setWithdrawingEventTarget(null)}
        onConfirm={confirmWithdrawExecution}
        documentTitle={withdrawingEventTarget?.title}
        documentTypeLabel="Activity Proposal"
      />

      {/* Supplemental Budget Review / Edit Modals */}
      <SupplementalBudgetDetailModal
        isOpen={Boolean(liveSelectedSbr)}
        onClose={() => setSelectedSbrId(null)}
        sbr={liveSelectedSbr}
        viewerRole={isAdviser ? 'adviser' : 'officer'}
        actor={{
          uid: profile?.authUid || profile?.uid || '',
          name: profile?.studentName || (profile as any)?.name || 'Club Officer',
          email: profile?.email || '',
          role: isAdviser ? 'adviser' : 'officer',
          signatureUrl: (profile as any)?.signatureUrl || undefined,
        }}
        onEditRequested={(sbrToEdit) => {
          setSelectedSbrId(null);
          setEditingSbr(sbrToEdit);
        }}
      />

      {editingSbr && (
        <SupplementalBudgetModal
          isOpen={Boolean(editingSbr)}
          onClose={() => setEditingSbr(null)}
          event={
            events.find((e) => e.id === editingSbr.eventId) || {
              id: editingSbr.eventId,
              title: editingSbr.eventTitle,
              totalApprovedBudget: editingSbr.baseApprovedBudget,
              startDate: editingSbr.eventStartDate,
            }
          }
          isSasInstitutional={false}
          organizationId={activeOrgId || editingSbr.organizationId}
          organizationName={activeOrg?.name || editingSbr.organizationName}
          organizationAcronym={activeOrg?.acronym || editingSbr.organizationAcronym}
          priorSupplementalTotal={editingSbr.priorSupplementalTotal}
          actor={{
            uid: profile?.authUid || profile?.uid || '',
            name: profile?.studentName || (profile as any)?.name || 'Club Officer',
            email: profile?.email || '',
            role: isAdviser ? 'adviser' : 'officer',
            signatureUrl: (profile as any)?.signatureUrl || undefined,
          }}
          existingSbr={editingSbr}
        />
      )}
    </div>
  );
}
