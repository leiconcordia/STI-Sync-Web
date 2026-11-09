import type { EventDocument } from '../../events/types/event.types';
import type { OrganizationDocument } from '../../organizations/types/organization.types';
import type {
  UniversalFilterState,
  APAnalyticsSummary,
  APReportRow,
} from '../types/report.types';
import { isEventInTrack } from './report-generator.service';

/**
 * Resolve display organizer name from event and organizations roster
 */
export function resolveEventOrganizer(
  event: EventDocument,
  orgsMap: Map<string, OrganizationDocument>
): string {
  if (event.hostingOrgId === 'sas' || event.hostingOrgId === 'institutional') {
    return 'Student Affairs & Services (SAS)';
  }
  const org = orgsMap.get(event.hostingOrgId);
  if (org) {
    return org.acronym ? `${org.acronym} — ${org.name}` : org.name;
  }
  return (event as any).organizerName || (event as any).organizer || 'Student Organization';
}

/**
 * Format target date and venue from event sessions
 */
export function resolveEventDateVenue(event: EventDocument): string {
  const session = event.sessions && event.sessions.length > 0 ? event.sessions[0] : null;
  const dateStr = session?.date ? new Date(session.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'TBD';
  const venueStr = event.customVenueName || (session as any)?.venueName || 'Campus Venue';
  return `${dateStr} · ${venueStr}`;
}

/**
 * Calculate lead time in days from submission / creation to final approval
 */
export function calculateEventLeadTimeDays(event: EventDocument): number | null {
  if (event.proposalStatus !== 'approved' && event.proposalStatus !== 'completed') return null;
  
  let startMs: number | null = null;
  if (event.createdAt) {
    if (typeof (event.createdAt as any).toDate === 'function') startMs = (event.createdAt as any).toDate().getTime();
    else if (typeof (event.createdAt as any).seconds === 'number') startMs = (event.createdAt as any).seconds * 1000;
    else startMs = new Date(event.createdAt as any).getTime();
  }

  let endMs: number | null = null;
  if (event.approvedAt) {
    if (typeof (event.approvedAt as any).toDate === 'function') endMs = (event.approvedAt as any).toDate().getTime();
    else if (typeof (event.approvedAt as any).seconds === 'number') endMs = (event.approvedAt as any).seconds * 1000;
    else endMs = new Date(event.approvedAt as any).getTime();
  } else if (event.updatedAt) {
    if (typeof (event.updatedAt as any).toDate === 'function') endMs = (event.updatedAt as any).toDate().getTime();
    else if (typeof (event.updatedAt as any).seconds === 'number') endMs = (event.updatedAt as any).seconds * 1000;
  }

  if (startMs && endMs && endMs >= startMs) {
    const diffDays = Math.round((endMs - startMs) / (1000 * 60 * 60 * 24));
    return Math.max(1, diffDays);
  }
  return null;
}

/**
 * Filter events by universal filters
 */
export function filterEventsByUniversalFilters(
  events: EventDocument[],
  filters: UniversalFilterState
): EventDocument[] {
  return events.filter((evt) => {
    // Exclude soft-deleted items
    if (evt.isDeleted) return false;

    // Scope filter (COLLEGE vs SHS)
    if (!isEventInTrack(evt, filters.scope)) return false;

    // Semester filter
    if (filters.semesterId !== 'ALL') {
      if (filters.academicYear && evt.schoolYear && evt.schoolYear !== filters.academicYear) {
        return false;
      }
      if (filters.semester && (evt as any).semester && (evt as any).semester !== filters.semester) {
        return false;
      }
    }

    // Organization filter
    if (filters.organizationId !== 'ALL') {
      if (filters.organizationId === 'sas') {
        if (evt.hostingOrgId !== 'sas' && evt.hostingOrgId !== 'institutional') return false;
      } else {
        if (evt.hostingOrgId !== filters.organizationId) return false;
      }
    }

    // Search query filter
    if (filters.searchQuery.trim()) {
      const q = filters.searchQuery.toLowerCase().trim();
      const ref = (evt.referenceId || (evt as any).referenceNo || '').toLowerCase();
      const title = (evt.title || '').toLowerCase();
      const org = (evt.hostingOrgId || '').toLowerCase();
      if (!ref.includes(q) && !title.includes(q) && !org.includes(q)) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Compute Activity Proposals Sub-Directory Analytics
 */
export function computeAPAnalytics(
  events: EventDocument[],
  filters: UniversalFilterState,
  organizations: OrganizationDocument[]
): APAnalyticsSummary {
  const orgsMap = new Map<string, OrganizationDocument>(organizations.map((o) => [o.id, o]));
  const filteredEvents = filterEventsByUniversalFilters(events, filters);

  let totalProposedBudget = 0;
  let totalApprovedBudget = 0;
  let approvedCount = 0;
  let pendingRevisionCount = 0;
  const leadTimes: number[] = [];

  // Monthly buckets: Jan-Dec
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthlyMap = new Map<string, { submitted: number; approved: number }>();
  months.forEach((m) => monthlyMap.set(m, { submitted: 0, approved: 0 }));

  // Funnel stage counts
  const funnelStages: Record<string, number> = {
    'SAS Coordinator Review': 0,
    'Department Endorsement': 0,
    'Academic Clearance': 0,
    'Administrator Endorsement': 0,
    'President Final Approval': 0,
  };

  const rows: APReportRow[] = filteredEvents.map((evt) => {
    const isApproved = evt.proposalStatus === 'approved' || evt.proposalStatus === 'completed';
    const isPending =
      evt.proposalStatus === 'pending' ||
      evt.proposalStatus === 'pending_review' ||
      evt.proposalStatus === 'draft';
    const isReturned = evt.proposalStatus === 'returned';

    if (isApproved) approvedCount++;
    if (isPending || isReturned) pendingRevisionCount++;

    const proposed =
      (evt as any).financialProjections?.totalExpenses ||
      evt.totalApprovedBudget ||
      0;
    const approved = isApproved ? evt.totalApprovedBudget || proposed : 0;

    totalProposedBudget += proposed;
    totalApprovedBudget += approved;

    // Lead time
    const leadDays = calculateEventLeadTimeDays(evt);
    if (leadDays !== null) leadTimes.push(leadDays);

    // Monthly volume
    let eventDate: Date | null = null;
    if (evt.createdAt) {
      if (typeof (evt.createdAt as any).toDate === 'function') eventDate = (evt.createdAt as any).toDate();
      else if (typeof (evt.createdAt as any).seconds === 'number') eventDate = new Date((evt.createdAt as any).seconds * 1000);
      else eventDate = new Date(evt.createdAt as any);
    }
    if (eventDate && !isNaN(eventDate.getTime())) {
      const mName = months[eventDate.getMonth()];
      const current = monthlyMap.get(mName) || { submitted: 0, approved: 0 };
      current.submitted += 1;
      if (isApproved) current.approved += 1;
      monthlyMap.set(mName, current);
    }

    // Determine current stage & funnel positioning
    let stageLabel = 'Drafting';
    const steps = (evt as any).approvalSteps || [];
    if (isApproved) {
      stageLabel = 'Fully Approved';
      funnelStages['President Final Approval'] += 1;
      funnelStages['Administrator Endorsement'] += 1;
      funnelStages['Academic Clearance'] += 1;
      funnelStages['Department Endorsement'] += 1;
      funnelStages['SAS Coordinator Review'] += 1;
    } else if (Array.isArray(steps) && steps.length > 0) {
      const activeStep = steps.find((s: any) => s.status === 'current') || steps[0];
      const roleStr = (activeStep?.role || '').toLowerCase();
      if (roleStr.includes('coordinator') || roleStr.includes('sas')) {
        stageLabel = 'Stage 1: SAS Coordinator';
        funnelStages['SAS Coordinator Review'] += 1;
      } else if (roleStr.includes('dept') || roleStr.includes('program')) {
        stageLabel = 'Stage 2: Dept Head';
        funnelStages['SAS Coordinator Review'] += 1;
        funnelStages['Department Endorsement'] += 1;
      } else if (roleStr.includes('acad') || roleStr.includes('principal')) {
        stageLabel = 'Stage 3: Academic Head';
        funnelStages['SAS Coordinator Review'] += 1;
        funnelStages['Department Endorsement'] += 1;
        funnelStages['Academic Clearance'] += 1;
      } else if (roleStr.includes('admin') || roleStr.includes('administrator')) {
        stageLabel = 'Stage 4: Administrator';
        funnelStages['SAS Coordinator Review'] += 1;
        funnelStages['Department Endorsement'] += 1;
        funnelStages['Academic Clearance'] += 1;
        funnelStages['Administrator Endorsement'] += 1;
      } else if (roleStr.includes('pres')) {
        stageLabel = 'Stage 5: President';
        funnelStages['SAS Coordinator Review'] += 1;
        funnelStages['Department Endorsement'] += 1;
        funnelStages['Academic Clearance'] += 1;
        funnelStages['Administrator Endorsement'] += 1;
        funnelStages['President Final Approval'] += 1;
      } else {
        stageLabel = activeStep?.roleTitle || 'In Review';
        funnelStages['SAS Coordinator Review'] += 1;
      }
    } else if (isReturned) {
      stageLabel = 'Returned for Revision';
    }

    const submissionDateStr = evt.createdAt
      ? typeof (evt.createdAt as any).toDate === 'function'
        ? (evt.createdAt as any).toDate().toLocaleDateString('en-US')
        : typeof (evt.createdAt as any).seconds === 'number'
        ? new Date((evt.createdAt as any).seconds * 1000).toLocaleDateString('en-US')
        : new Date(evt.createdAt as any).toLocaleDateString('en-US')
      : 'N/A';

    return {
      id: evt.id,
      referenceNo: evt.referenceId || (evt as any).referenceNo || `AP-${evt.id.slice(0, 6)}`,
      title: evt.title || 'Untitled Activity',
      organizer: resolveEventOrganizer(evt, orgsMap),
      organizationId: evt.hostingOrgId,
      targetDateVenue: resolveEventDateVenue(evt),
      proposedBudget: proposed,
      approvedBudget: approved,
      signatoryStatus: evt.proposalStatus || 'pending',
      stage: stageLabel,
      submissionDate: submissionDateStr,
      rawEvent: evt,
    };
  });

  const totalProposalsSubmitted = filteredEvents.length;
  const approvalRate =
    totalProposalsSubmitted > 0
      ? Number(((approvedCount / totalProposalsSubmitted) * 100).toFixed(1))
      : 0;

  const averageLeadTimeDays =
    leadTimes.length > 0
      ? Number((leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length).toFixed(1))
      : 3.5;

  const monthlyVolume = months.map((month) => ({
    month,
    submitted: monthlyMap.get(month)?.submitted || 0,
    approved: monthlyMap.get(month)?.approved || 0,
  }));

  const approvalFunnel = [
    { stage: '1. SAS Coordinator', count: funnelStages['SAS Coordinator Review'] },
    { stage: '2. Dept Head', count: funnelStages['Department Endorsement'] },
    { stage: '3. Academic Head', count: funnelStages['Academic Clearance'] },
    { stage: '4. Administrator', count: funnelStages['Administrator Endorsement'] },
    { stage: '5. President', count: funnelStages['President Final Approval'] },
  ];

  return {
    kpis: {
      totalProposalsSubmitted,
      approvalRate,
      averageLeadTimeDays,
      totalProposedBudget,
      totalApprovedBudget,
      pendingRevisionCount,
    },
    charts: {
      monthlyVolume,
      approvalFunnel,
    },
    rows,
  };
}

