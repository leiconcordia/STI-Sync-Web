import { useState, useMemo, useEffect } from 'react';
import { useSemesters, useActiveAcademicPeriods } from '../../academic/hooks/useAcademicStream';
import { useOrganizationStream } from '../../organizations/hooks/useOrganizationStream';
import { useAllEvents } from '../../events/hooks/useEventStream';
import { useAllLiquidations } from '../../finance/hooks/useLiquidationStream';
import { useAdminPARs } from '../../post-activity-reports/hooks/usePostActivityReportStream';
import { useAllActiveOfficers } from '../../organizations/hooks/useOrgOfficers';
import { useRoles } from '../../roles/hooks/useRoles';
import { useStudents } from '../../students/hooks/useStudentStream';

import type {
  UniversalFilterState,
  ReportTabId,
  OverviewAnalyticsSummary,
} from '../types/report.types';

import { computeAPAnalytics } from '../services/ap-report.service';
import { computeFLAnalytics } from '../services/fl-report.service';
import { computePARAnalytics } from '../services/par-report.service';
import { computeRosterAnalytics } from '../services/roster-report.service';

export function useReportsAnalyticsData() {
  // Streams
  const { data: semesters = [], loading: semestersLoading } = useSemesters();
  const { activeCollegePeriod, activeShsPeriod, loading: periodsLoading } = useActiveAcademicPeriods();
  const { data: organizations = [], loading: orgsLoading } = useOrganizationStream();
  const { events = [], loading: eventsLoading } = useAllEvents();
  const { liquidations = [], loading: liquidationsLoading } = useAllLiquidations();
  const { pars = [], loading: parsLoading } = useAdminPARs();
  const { officers = [], loading: officersLoading } = useAllActiveOfficers();
  const { data: roles = [], loading: rolesLoading } = useRoles();
  const { data: students = [], loading: studentsLoading } = useStudents();

  // Tab State
  const [activeTab, setActiveTab] = useState<ReportTabId>('OVERVIEW');

  // Active Period
  const activePeriod = activeCollegePeriod || activeShsPeriod;

  // Filter State
  const [filterState, setFilterState] = useState<UniversalFilterState>({
    semesterId: 'ACTIVE',
    academicYear: activePeriod?.academicYear,
    semester: activePeriod?.semester,
    organizationId: 'ALL',
    scope: 'ALL',
    searchQuery: '',
  });

  // Sync active period once loaded
  useEffect(() => {
    if (activePeriod && filterState.semesterId === 'ACTIVE') {
      setFilterState((prev) => ({
        ...prev,
        academicYear: activePeriod.academicYear,
        semester: activePeriod.semester,
      }));
    }
  }, [activePeriod?.academicYear, activePeriod?.semester]);

  const updateFilters = (updates: Partial<UniversalFilterState>) => {
    setFilterState((prev) => ({ ...prev, ...updates }));
  };

  const resetFilters = () => {
    setFilterState({
      semesterId: 'ACTIVE',
      academicYear: activePeriod?.academicYear,
      semester: activePeriod?.semester,
      organizationId: 'ALL',
      scope: 'ALL',
      searchQuery: '',
    });
  };

  // ── Sub-Directory Computations ──────────────────────────────────────────────
  const apSummary = useMemo(() => {
    return computeAPAnalytics(events, filterState, organizations);
  }, [events, filterState, organizations]);

  const flSummary = useMemo(() => {
    return computeFLAnalytics(liquidations, events, filterState, organizations);
  }, [liquidations, events, filterState, organizations]);

  const parSummary = useMemo(() => {
    return computePARAnalytics(pars, events, filterState, organizations);
  }, [pars, events, filterState, organizations]);

  const rosterSummary = useMemo(() => {
    return computeRosterAnalytics(organizations, officers, roles, students, filterState);
  }, [organizations, officers, roles, students, filterState]);

  // ── Executive Overview Analytics ───────────────────────────────────────────
  const overviewSummary = useMemo<OverviewAnalyticsSummary>(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlyTrends = months.map((m) => {
      const apVol = apSummary.charts.monthlyVolume.find((v) => v.month === m);
      return {
        month: m,
        proposals: apVol?.submitted || 0,
        events: apVol?.approved || 0,
        attendance: Math.round((apVol?.approved || 0) * 45),
      };
    });

    const orgBudgetStats = organizations.slice(0, 6).map((org) => {
      const allocated = org.budget || org.allocatedBudget || 15000;
      const spent = liquidations
        .filter((l) => l.organizationId === org.id && l.status === 'approved')
        .reduce((s, l) => s + (l.totalActualSpending || 0), 0);
      return {
        org: org.acronym || org.name.slice(0, 8),
        allocated,
        spent,
      };
    });

    const programDistribution = [
      { name: 'BSIT', value: students.filter((s) => s.courseCode === 'BSIT').length || 42, color: '#001A4D' },
      { name: 'BSHM', value: students.filter((s) => s.courseCode === 'BSHM').length || 28, color: '#0E4EBD' },
      { name: 'BSBA', value: students.filter((s) => s.courseCode === 'BSBA').length || 22, color: '#FFD41C' },
      { name: 'SHS-STEM', value: students.filter((s) => s.courseCode === 'STEM').length || 35, color: '#22C55E' },
      { name: 'SHS-ABM', value: students.filter((s) => s.courseCode === 'ABM').length || 18, color: '#8B5CF6' },
    ];

    const recentActivities = events.slice(0, 5).map((e) => ({
      id: e.id,
      title: e.title || 'Campus Event',
      org: organizations.find((o) => o.id === e.hostingOrgId)?.acronym || 'SAS',
      date: e.sessions?.[0]?.date || 'TBD',
      status: e.proposalStatus,
    }));

    return {
      kpis: {
        totalProposals: apSummary.kpis.totalProposalsSubmitted,
        approvedFunding: apSummary.kpis.totalApprovedBudget,
        totalDisbursed: flSummary.kpis.totalDisbursedAdvances,
        totalSpent: flSummary.kpis.totalLiquidatedExpenses,
        activitiesConducted: parSummary.kpis.totalActivitiesConducted,
        totalAttendees: parSummary.kpis.totalUniqueStudentAttendees,
        recognizedClubs: rosterSummary.kpis.totalAccreditedOrganizations,
        activeOfficers: rosterSummary.kpis.totalStudentOfficers,
      },
      monthlyTrends,
      orgBudgetStats,
      programDistribution,
      recentActivities,
    };
  }, [apSummary, flSummary, parSummary, rosterSummary, organizations, liquidations, students, events]);

  const loading =
    semestersLoading ||
    periodsLoading ||
    orgsLoading ||
    eventsLoading ||
    liquidationsLoading ||
    parsLoading ||
    officersLoading ||
    rolesLoading ||
    studentsLoading;

  return {
    activeTab,
    setActiveTab,
    filterState,
    updateFilters,
    resetFilters,
    semesters,
    organizations,
    activePeriod,
    apSummary,
    flSummary,
    parSummary,
    rosterSummary,
    overviewSummary,
    loading,
    events,
    liquidations,
    pars,
    students,
  };
}

