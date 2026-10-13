import { useMemo } from 'react';
import { Link } from 'react-router';
import {
  Calendar,
  Receipt,
  Users,
  MapPin,
  Clock,
  CheckCircle,
  ArrowRight,
  CalendarDays,
  FileCheck2,
  AlertCircle,
  FileText,
} from 'lucide-react';
import { useOfficerProfile } from '../../auth/hooks/useOfficerProfile';
import { useOrganizationStream } from '../../modules/organizations/hooks/useOrganizationStream';
import { useOrgEvents } from '../../modules/events/hooks/useEventStream';
import { useOrgLiquidations } from '../../modules/finance/hooks/useLiquidationStream';
import { useOfficerPARs } from '../../modules/post-activity-reports/hooks/usePostActivityReportStream';
import { useOrgMembers } from '../../modules/organizations/hooks/useOrgMembers';
import { useOrgOfficers } from '../../modules/organizations/hooks/useOrgOfficers';
import { useRoles } from '../../modules/roles/hooks/useRoles';
import { useStudents } from '../../modules/students/hooks/useStudentStream';
import { useActiveAcademicPeriods } from '../../modules/academic/hooks/useAcademicStream';
import { formatAppDate, format12HourTime } from '../../utils/date';

const getTimestampMs = (val: any): number => {
  if (!val) return 0;
  if (typeof val?.toDate === 'function') return val.toDate().getTime();
  if (typeof val?.seconds === 'number') return val.seconds * 1000;
  if (typeof val === 'string' || typeof val === 'number') {
    const parsed = new Date(val).getTime();
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
};

export default function OfficerDashboardPage() {
  const { profile } = useOfficerProfile();
  const { data: orgs } = useOrganizationStream();
  const { data: roles = [] } = useRoles();
  const { data: students = [], loading: studentsLoading } = useStudents();
  const { activeCollegePeriod, activeShsPeriod, isStudentPendingReEnrollment } = useActiveAcademicPeriods();

  const activeOrgId = profile?.activeOrganizationId || '';
  const activeOrg = orgs.find((o) => o.id === activeOrgId);
  const officerName = profile?.studentName || 'Officer';

  const { events, loading: eventsLoading } = useOrgEvents(activeOrgId);
  const { liquidations, loading: liquidationsLoading } = useOrgLiquidations(activeOrgId);
  const { pars = [], loading: parsLoading } = useOfficerPARs(activeOrgId);
  const { members, loading: membersLoading } = useOrgMembers(activeOrgId);
  const { officers = [] } = useOrgOfficers(activeOrgId);

  // Student lookup map for fast student status and enrollment resolution
  const studentMap = useMemo(() => {
    const map = new Map<string, any>();
    students.forEach((s) => {
      if (s.studentId) map.set(s.studentId.trim().toLowerCase(), s);
      if (s.email) map.set(s.email.trim().toLowerCase(), s);
    });
    return map;
  }, [students]);

  // Resolve active enrolled members (excluding inactive, unapproved, or unenrolled students for this term)
  const activeEnrolledMembersCount = useMemo(() => {
    return members.filter((m) => {
      if (m.status !== 'active') return false;
      const st =
        studentMap.get((m.studentId || '').trim().toLowerCase()) ||
        studentMap.get((m.email || '').trim().toLowerCase());
      if (st) {
        if (st.status !== 'ACTIVE') return false;
        if (isStudentPendingReEnrollment(st)) return false;
      }
      return true;
    }).length;
  }, [members, studentMap, isStudentPendingReEnrollment]);

  // Resolve account owner position (e.g., Adviser, President, Vice President, Secretary)
  const positionTitle = (() => {
    // 1. Explicit adviser flag or role ID
    if (profile?.isAdviser || profile?.activeRoleId?.toLowerCase() === 'adviser') {
      return 'Adviser';
    }

    // 2. Organization adviser match
    if (
      activeOrg?.adviser?.name &&
      profile?.studentName &&
      activeOrg.adviser.name.trim().toLowerCase() === profile.studentName.trim().toLowerCase()
    ) {
      return 'Adviser';
    }

    // 3. Match activeRoleId from profile in roles list
    if (profile?.activeRoleId) {
      const matchedRole = roles.find((r) => r.id === profile.activeRoleId);
      if (matchedRole?.name) return matchedRole.name;
    }

    // 4. Look up current user in org officers collection
    const currentOfficer = officers.find(
      (o) =>
        (profile?.studentId && o.studentId === profile.studentId) ||
        (profile?.email && o.email?.toLowerCase() === profile.email.toLowerCase())
    );

    if (currentOfficer?.roleId) {
      const matchedRole = roles.find((r) => r.id === currentOfficer.roleId);
      if (matchedRole?.name) return matchedRole.name;
    }

    // 5. Check if named as President in organization document
    if (
      activeOrg?.presidentName &&
      profile?.studentName &&
      activeOrg.presidentName.trim().toLowerCase() === profile.studentName.trim().toLowerCase()
    ) {
      return 'President';
    }

    // 6. Readable fallback if activeRoleId is a plain string title
    if (profile?.activeRoleId && profile.activeRoleId.length > 2 && !profile.activeRoleId.includes('-')) {
      return profile.activeRoleId.charAt(0).toUpperCase() + profile.activeRoleId.slice(1);
    }

    return '';
  })();

  // Greeting name with position (e.g., "Adviser Ann Perez" or "President John Paul Gomez")
  const greetingDisplayName = positionTitle
    ? (officerName.toLowerCase().startsWith(positionTitle.toLowerCase())
        ? officerName
        : `${positionTitle} ${officerName}`)
    : officerName;

  // Approved activities strictly cleared for execution (excluding pending, draft, returned, or concluded)
  const approvedActivitiesList = useMemo(() => {
    const list = events.filter((e) => {
      const pStatus = (e.proposalStatus || '').toLowerCase();
      const status = ((e as any).status || '').toLowerCase();
      const lifecycle = (((e as any).lifecycleStatus || '') as string).toLowerCase();

      // Must be approved / activated
      const isApproved =
        pStatus === 'approved' ||
        pStatus === 'activated' ||
        pStatus === 'approved_president';

      if (!isApproved) return false;

      // Strictly exclude concluded / completed / cancelled / archived
      if (
        pStatus === 'completed' ||
        pStatus === 'concluded' ||
        status === 'completed' ||
        status === 'concluded' ||
        status === 'cancelled' ||
        status === 'archived' ||
        lifecycle === 'completed' ||
        lifecycle === 'concluded' ||
        lifecycle === 'cancelled' ||
        lifecycle === 'archived' ||
        (e as any).isArchived
      ) {
        return false;
      }

      return true;
    });

    return list.sort((a, b) => {
      const dateA = a.sessions?.[0]?.date || (a as any).targetImplementationDate || '';
      const dateB = b.sessions?.[0]?.date || (b as any).targetImplementationDate || '';
      if (dateA && dateB) return dateA.localeCompare(dateB);
      return getTimestampMs(b.createdAt) - getTimestampMs(a.createdAt);
    });
  }, [events]);

  const pendingLiquidationsCount = liquidations.filter(
    (l) => l.status === 'pending' || l.status === 'draft' || l.status === 'returned'
  ).length;

  const pendingPARsCount = pars.filter(
    (p) => p.status === 'draft' || p.status === 'returned' || p.status === 'under_review'
  ).length;

  // Completed activities in the current active semester / trimester
  const completedActivitiesCurrentSemCount = useMemo(() => {
    const activePeriodIds = new Set<string>();
    if (activeCollegePeriod?.id) activePeriodIds.add(activeCollegePeriod.id);
    if (activeShsPeriod?.id) activePeriodIds.add(activeShsPeriod.id);

    const activeYears = new Set<string>();
    if (activeCollegePeriod?.academicYear) activeYears.add(activeCollegePeriod.academicYear);
    if (activeShsPeriod?.academicYear) activeYears.add(activeShsPeriod.academicYear);

    const activeSemNames = new Set<string>();
    if (activeCollegePeriod?.semester) activeSemNames.add(activeCollegePeriod.semester.toLowerCase());
    if (activeShsPeriod?.semester) activeSemNames.add(activeShsPeriod.semester.toLowerCase());

    return events.filter((e) => {
      const isCompleted =
        e.proposalStatus === 'completed' ||
        (e as any).status === 'completed' ||
        (e as any).status === 'Completed';
      if (!isCompleted) return false;

      if (e.semesterId && activePeriodIds.has(e.semesterId)) return true;
      if (e.schoolYear && activeYears.has(e.schoolYear)) {
        if ((e as any).semester && activeSemNames.has(String((e as any).semester).toLowerCase())) return true;
        return true;
      }
      if (!e.semesterId && !e.schoolYear) return true;
      return false;
    }).length;
  }, [events, activeCollegePeriod, activeShsPeriod]);

  // Real Pending Action Items sorted FIFO by creation date (oldest created first)
  const pendingTasks = useMemo(() => {
    const tasks: { id: string; task: string; dueDate: string; isDueDays: boolean; link: string; createdAtTime: number }[] = [];

    // 1. Returned post-activity reports (Urgent revisions requested by SAO)
    pars.forEach((p) => {
      if (p.status === 'returned') {
        tasks.push({
          id: `par-${p.id}`,
          task: `Revise returned post-activity report: ${p.eventTitle || p.referenceNo}`,
          dueDate: (p as any).returnRemarks ? `Remarks: ${(p as any).returnRemarks.slice(0, 35)}...` : 'Revision requested by reviewer',
          isDueDays: true,
          link: `/officer/post-activity-reports?id=${p.id}`,
          createdAtTime: getTimestampMs((p as any).updatedAt || (p as any).createdAt),
        });
      }
    });

    // 2. Returned liquidations (Urgent revisions requested by SAO)
    liquidations.forEach((l) => {
      if (l.status === 'returned') {
        tasks.push({
          id: `liq-${l.id}`,
          task: `Revise returned liquidation: ${l.eventTitle}`,
          dueDate: l.returnRemarks ? `Remarks: ${l.returnRemarks.slice(0, 35)}...` : 'Revision requested by SAO Adviser',
          isDueDays: true,
          link: '/officer/liquidation',
          createdAtTime: getTimestampMs(l.createdAt),
        });
      }
    });

    // 3. Returned activity proposals (Urgent revisions requested by SAO)
    events.forEach((e) => {
      if (e.proposalStatus === 'returned') {
        tasks.push({
          id: `evt-${e.id}`,
          task: `Revise returned activity proposal: ${e.title}`,
          dueDate: e.adviserRemarks ? `Remarks: ${e.adviserRemarks.slice(0, 35)}...` : 'Revision requested by reviewer',
          isDueDays: true,
          link: '/officer/events',
          createdAtTime: getTimestampMs(e.createdAt),
        });
      }
    });

    // 4. Completed activities requiring Form PAR-01 Post-Activity Report
    const parEventIds = new Set(pars.map((p) => p.eventId));
    events.forEach((e) => {
      const isCompleted =
        e.proposalStatus === 'completed' ||
        (e as any).status === 'completed' ||
        (e as any).status === 'Completed';
      if (isCompleted && !parEventIds.has(e.id)) {
        tasks.push({
          id: `par-create-${e.id}`,
          task: `Submit post-activity report: ${e.title}`,
          dueDate: 'Concluded activity requires Post-Activity Report',
          isDueDays: true,
          link: '/officer/post-activity-reports',
          createdAtTime: getTimestampMs(e.updatedAt || e.createdAt),
        });
      }
    });

    // 5. Pending membership applications (Awaiting officer review & approval)
    members.forEach((m) => {
      if (m.status === 'pending') {
        tasks.push({
          id: `mem-${m.id}`,
          task: `Review membership application: ${m.studentName || 'Student'}`,
          dueDate: m.course
            ? `${m.course}${m.year ? ` • Year ${m.year}` : ''} (${m.studentId || 'Pending'})`
            : 'Membership application awaiting approval',
          isDueDays: false,
          link: '/officer/members?tab=pending',
          createdAtTime: getTimestampMs(m.applicationDate || m.createdAt || m.dateJoined),
        });
      }
    });

    // 6. Draft post-activity reports (In progress)
    pars.forEach((p) => {
      if (p.status === 'draft') {
        tasks.push({
          id: `par-draft-${p.id}`,
          task: `Complete draft post-activity report: ${p.eventTitle || p.referenceNo}`,
          dueDate: 'Draft in progress',
          isDueDays: false,
          link: `/officer/post-activity-reports?id=${p.id}`,
          createdAtTime: getTimestampMs((p as any).createdAt),
        });
      }
    });

    // 7. Draft liquidations (In progress)
    liquidations.forEach((l) => {
      if (l.status === 'draft') {
        tasks.push({
          id: `liq-${l.id}`,
          task: `Complete draft liquidation: ${l.eventTitle}`,
          dueDate: 'Draft in progress',
          isDueDays: false,
          link: '/officer/liquidation',
          createdAtTime: getTimestampMs(l.createdAt),
        });
      }
    });

    // 8. Draft activity proposals (In progress)
    events.forEach((e) => {
      if (e.proposalStatus === 'draft') {
        tasks.push({
          id: `evt-${e.id}`,
          task: `Submit draft activity proposal: ${e.title}`,
          dueDate: 'Draft in progress',
          isDueDays: false,
          link: '/officer/events',
          createdAtTime: getTimestampMs(e.createdAt),
        });
      }
    });

    // Sort FIFO: oldest created first
    return tasks.sort((a, b) => a.createdAtTime - b.createdAtTime);
  }, [liquidations, events, pars, members]);

  const statusColors: Record<string, string> = {
    approved: 'bg-[#639922]',
    pending: 'bg-[#BA7517]',
    pending_review: 'bg-[#BA7517]',
    draft: 'bg-[#888780]',
    returned: 'bg-[#D97706]',
    rejected: 'bg-[#E24B4A]',
    completed: 'bg-[#0E4EBD]',
  };

  const dotColors: Record<string, string> = {
    approved: 'bg-[#639922]',
    pending: 'bg-[#BA7517]',
    pending_review: 'bg-[#BA7517]',
    draft: 'bg-[#888780]',
    returned: 'bg-amber-500',
    rejected: 'bg-[#E24B4A]',
    completed: 'bg-[#0E4EBD]',
  };

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-blue-50/70 border border-blue-200/80 rounded-2xl p-6 flex items-center justify-between shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-[#001A4D] text-[#FFD41C] uppercase tracking-wider">
              {activeOrg?.acronym || 'STI SAS'}
            </span>
            <span className="text-xs text-gray-500 font-medium">
              {activeOrg ? activeOrg.name : 'STI College Ormoc'}
            </span>
          </div>
          <h2 className="text-[#001A4D] text-[20px] font-bold">Good day, {greetingDisplayName} 👋</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Overview of organization activity proposals, approved activities schedule, post-activity reports, and liquidations.
          </p>
        </div>
        <div className="w-12 h-12 bg-blue-100/80 rounded-xl flex items-center justify-center border border-blue-200">
          <CalendarDays className="w-6 h-6 text-[#0E4EBD]" />
        </div>
      </div>

      {/* Metric Summary Row - 5 Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* 1. Approved Activities */}
        <div className="bg-white border border-[#E0E0E0] rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-500 text-[13px] font-medium">Approved Activities</span>
            <CalendarDays className="w-5 h-5 text-[#0E4EBD]" />
          </div>
          <div className="text-[#001A4D] text-[24px] font-bold">
            {eventsLoading ? '...' : approvedActivitiesList.length}
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5">Cleared for execution</p>
        </div>

        {/* 2. Pending Liquidations */}
        <div className="bg-white border border-[#E0E0E0] rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-500 text-[13px] font-medium">Pending Liquidations</span>
            <Receipt className="w-5 h-5 text-amber-500" />
          </div>
          <div className="text-amber-600 text-[24px] font-bold">
            {liquidationsLoading ? '...' : pendingLiquidationsCount}
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5">Draft or in review</p>
        </div>

        {/* 3. Post-Activity Reports */}
        <div className="bg-white border border-[#E0E0E0] rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-500 text-[13px] font-medium">Post-Activity Reports</span>
            <FileCheck2 className="w-5 h-5 text-[#FF5E36]" />
          </div>
          <div className="text-[#FF5E36] text-[24px] font-bold">
            {parsLoading ? '...' : pendingPARsCount}
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5">Draft or under review</p>
        </div>

        {/* 4. Completed Activities */}
        <div className="bg-white border border-[#E0E0E0] rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-500 text-[13px] font-medium">Completed Activities</span>
            <CheckCircle className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="text-emerald-700 text-[24px] font-bold">
            {eventsLoading ? '...' : completedActivitiesCurrentSemCount}
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5">In current term</p>
        </div>

        {/* 5. Active Members */}
        <div className="bg-white border border-[#E0E0E0] rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-500 text-[13px] font-medium">Active Members</span>
            <Users className="w-5 h-5 text-[#001A4D]" />
          </div>
          <div className="text-[#001A4D] text-[24px] font-bold">
            {membersLoading || studentsLoading ? '...' : activeEnrolledMembersCount}
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5">Enrolled this term</p>
        </div>
      </div>

      {/* Two-column section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Approved Activities Schedule (Approved activities cleared for execution) */}
        <div className="lg:col-span-7 bg-white border border-[#E0E0E0] rounded-2xl overflow-hidden shadow-xs flex flex-col justify-between">
          <div>
            <div className="p-5 border-b border-[#E0E0E0] flex items-center justify-between">
              <div>
                <h3 className="text-[#001A4D] text-[16px] font-bold">Approved Activities Schedule</h3>
                <p className="text-xs text-gray-400 mt-0.5">Approved activities cleared for execution this term</p>
              </div>
              <Link to="/officer/events" className="text-[#0E4EBD] text-[13px] font-bold hover:underline flex items-center gap-1">
                View All Activities <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="p-5 space-y-4">
              {eventsLoading ? (
                <div className="text-center text-gray-400 py-6 text-xs">Loading activities...</div>
              ) : approvedActivitiesList.length === 0 ? (
                <div className="text-center text-gray-500 py-8 text-sm">
                  No approved activities currently scheduled. Submit an activity proposal in Activity Management for review and approval.
                </div>
              ) : (
                approvedActivitiesList.slice(0, 5).map((activity) => {
                  const firstSession = activity.sessions && activity.sessions[0];
                  const dateStr = firstSession ? formatAppDate(firstSession.date, 'TBD') : (activity as any).targetImplementationDate || 'TBD';
                  const timeStr = firstSession && firstSession.startTime ? `${format12HourTime(firstSession.startTime)}${firstSession.endTime ? ` – ${format12HourTime(firstSession.endTime)}` : ''}` : '';
                  const taskCount = Array.isArray(activity.tasks) ? activity.tasks.length : 0;
                  const hostAcronym =
                    activity.hostingOrgId === 'sas' || (activity as any).isSas || !activity.hostingOrgId
                      ? 'STI SAS'
                      : (activeOrg?.acronym || 'STI SAS');

                  return (
                    <div key={activity.id} className="flex items-start gap-3 pb-4 border-b border-gray-100 last:border-0 last:pb-0">
                      <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full mt-2 flex-shrink-0" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#001A4D] text-[#FFD41C] uppercase tracking-wider">
                            {hostAcronym}
                          </span>
                          <h4 className="text-[#001A4D] text-[14px] font-bold">{activity.title}</h4>
                          {taskCount > 0 && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-600">
                              {taskCount} {taskCount === 1 ? 'Task' : 'Tasks'}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-gray-500 text-[12px]">
                          <div className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-[#0E4EBD]" />
                            <span>{dateStr} {timeStr ? `· ${timeStr}` : ''}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-[#0E4EBD]" />
                            <span>{activity.customVenueName || firstSession?.venueName || 'On-Campus'}</span>
                          </div>
                        </div>
                      </div>
                      <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-full text-[11px] font-bold flex-shrink-0">
                        Approved
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Pending Action Items (5 rows, FIFO created date) */}
        <div className="lg:col-span-5 bg-white border border-[#E0E0E0] rounded-2xl overflow-hidden shadow-xs flex flex-col justify-between">
          <div>
            <div className="p-5 border-b border-[#E0E0E0]">
              <h3 className="text-[#001A4D] text-[16px] font-bold">Pending Action Items</h3>
              <p className="text-xs text-gray-400 mt-0.5">Revisions, unsubmitted reports, and draft items requiring action</p>
            </div>
            <div className="p-5 space-y-3">
              {pendingTasks.length === 0 ? (
                <div className="text-center py-8 space-y-2">
                  <CheckCircle className="w-10 h-10 text-green-500 mx-auto" />
                  <p className="text-sm font-bold text-gray-800">You're all caught up!</p>
                  <p className="text-xs text-gray-500">No pending task revisions, applications, or drafts requiring action.</p>
                </div>
              ) : (
                pendingTasks.slice(0, 5).map((task) => (
                  <div key={task.id} className="flex items-start gap-3 pb-3 border-b border-gray-100 last:border-0 last:pb-0">
                    <div className="w-5 h-5 border-2 border-[#0E4EBD] rounded-full mt-0.5 flex-shrink-0 flex items-center justify-center">
                      <div className="w-2 h-2 bg-[#0E4EBD] rounded-full" />
                    </div>
                    <div className="flex-1">
                      <p className="text-[#001A4D] text-[13px] font-bold mb-0.5">{task.task}</p>
                      <p className={`text-[11px] ${task.isDueDays ? 'text-[#E24B4A] font-semibold' : 'text-gray-500'}`}>
                        {task.dueDate}
                      </p>
                    </div>
                    <Link
                      to={task.link}
                      className="px-3 py-1.5 bg-[#001A4D] hover:bg-[#0E4EBD] text-white rounded-lg text-[12px] font-bold transition-colors flex-shrink-0 shadow-xs"
                    >
                      Act
                    </Link>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
