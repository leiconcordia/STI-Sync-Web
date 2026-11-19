import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAvailableSchoolYears,
  computeDashboardKpiCounts,
  matchesRecordAcademicPeriod,
  matchesSchoolYearFilter,
  resolveDefaultSchoolYearFilter,
  resolveUnifiedActiveAcademicTerm,
} from '../academic-period-filter.utils.ts';

describe('Academic Period Default Filtering & Card/Table Consistency', () => {
  const semesters = [
    { id: 'sem_old', academicYear: '2025-2026', semester: '2nd Semester', isActive: false },
    { id: 'sem_cur_1', academicYear: '2026-2027', semester: '1st Semester', isActive: true },
    { id: 'sem_cur_2', academicYear: '2026-2027', semester: '2nd Semester', isActive: false },
  ];

  test('resolveDefaultSchoolYearFilter prefers active unified SY and falls back to latest available SY', () => {
    const available = ['2026-2027', '2025-2026'];
    assert.equal(
      resolveDefaultSchoolYearFilter({
        unifiedSchoolYear: 'SY 2026-2027',
        availableSchoolYears: available,
      }),
      '2026-2027'
    );
    assert.equal(
      resolveDefaultSchoolYearFilter({
        unifiedSchoolYear: '',
        availableSchoolYears: available,
      }),
      '2026-2027'
    );
  });

  test('matchesRecordAcademicPeriod scopes records strictly to current SY and preserves Card vs Table parity', () => {
    const records = [
      // Past school year records (e.g., 17 older approved records + 1 untagged legacy)
      { id: 'old_1', schoolYear: '2025-2026', semester: '2nd Semester', status: 'approved' },
      { id: 'legacy_untagged', status: 'approved' },
      // Current school year records across terms (e.g., 2 approved in current SY)
      { id: 'cur_1', schoolYear: '2026-2027', semester: '1st Semester', status: 'approved' },
      { id: 'cur_2', semesterId: 'sem_cur_2', status: 'approved' },
      // Child FL / PAR inheriting schoolYear from parent event
      { id: 'child_cur', eventId: 'cur_event', status: 'approved' },
      { id: 'child_old', eventId: 'old_event', status: 'approved' },
    ];
    const eventsById = new Map([
      ['cur_event', { id: 'cur_event', schoolYear: '2026-2027', semester: '1st Semester' }],
      ['old_event', { id: 'old_event', schoolYear: '2025-2026', semester: '2nd Semester' }],
    ]);
    const availableSchoolYears = buildAvailableSchoolYears({
      semesters,
      records,
      activeSchoolYear: '2026-2027',
    });
    const defaultSy = resolveDefaultSchoolYearFilter({
      unifiedSchoolYear: '2026-2027',
      availableSchoolYears,
    });

    // Default view filters by Current SY and All Semesters (shows cur_1, cur_2, child_cur = 3, NOT old_1 / legacy / child_old)
    const periodScoped = records.filter((rec) =>
      matchesRecordAcademicPeriod({
        record: rec,
        parentEvent: rec.eventId ? eventsById.get(rec.eventId) : null,
        semesters,
        filterSchoolYear: defaultSy,
        filterSemester: 'all',
        availableSchoolYears,
      })
    );

    assert.deepEqual(
      periodScoped.map((r) => r.id),
      ['cur_1', 'cur_2', 'child_cur']
    );

    // Narrowing to a specific semester still matches cleanly
    const firstSemOnly = records.filter((rec) =>
      matchesRecordAcademicPeriod({
        record: rec,
        parentEvent: rec.eventId ? eventsById.get(rec.eventId) : null,
        semesters,
        filterSchoolYear: defaultSy,
        filterSemester: '1st Semester',
        availableSchoolYears,
      })
    );
    assert.deepEqual(
      firstSemOnly.map((r) => r.id),
      ['cur_1', 'child_cur']
    );

    // Selecting oldest SY includes legacy untagged records + explicit 2025-2026 records
    const oldestSyScoped = records.filter((rec) =>
      matchesRecordAcademicPeriod({
        record: rec,
        parentEvent: rec.eventId ? eventsById.get(rec.eventId) : null,
        semesters,
        filterSchoolYear: '2025-2026',
        filterSemester: 'all',
        availableSchoolYears,
      })
    );
    assert.deepEqual(
      oldestSyScoped.map((r) => r.id),
      ['old_1', 'legacy_untagged', 'child_old']
    );
  });

  test('matchesSchoolYearFilter and resolveUnifiedActiveAcademicTerm handle closed configs gracefully', () => {
    const resolved = resolveUnifiedActiveAcademicTerm({
      configs: [
        { id: 'c1', schoolYear: '2025-2026', activeSemester: '2nd Semester', status: 'CLOSED', isActive: false },
        { id: 'c2', schoolYear: '2026-2027', activeSemester: '1st Semester', status: 'ACTIVE', isActive: true },
      ],
      activeCollegePeriod: null,
      activeShsPeriod: null,
    });
    assert.equal(resolved.schoolYear, '2026-2027');
    assert.equal(
      matchesSchoolYearFilter({
        recordSchoolYear: 'A.Y. 2026–2027',
        filterSchoolYear: '2026-2027',
        availableSchoolYears: ['2026-2027', '2025-2026'],
      }),
      true
    );
  });

  test('computeDashboardKpiCounts counts both Orgs and SAS waiting/approved items for the current School Year only', () => {
    const events = [
      // Current SY pending APs (both Org & SAS)
      { id: 'ap_org_pending', hostingOrgId: 'org1', schoolYear: '2026-2027', proposalStatus: 'pending_review' },
      { id: 'ap_sas_pending', hostingOrgId: 'sas_admin', schoolYear: '2026-2027', proposalStatus: 'under_review' },
      // Current SY approved APs (direct status, full signatory chain, and completed/concluded AP)
      { id: 'ap_org_approved', hostingOrgId: 'org1', schoolYear: '2026-2027', proposalStatus: 'approved' },
      {
        id: 'ap_sas_chain',
        hostingOrgId: 'sas_admin',
        schoolYear: '2026-2027',
        proposalStatus: 'under_review',
        approvalChain: [{ status: 'endorsed' }, { status: 'approved' }],
      },
      { id: 'ap_org_completed', hostingOrgId: 'org2', schoolYear: '2026-2027', proposalStatus: 'completed' },
      // Current SY excluded states
      { id: 'ap_returned', hostingOrgId: 'org1', schoolYear: '2026-2027', proposalStatus: 'pending_review', isReturned: true },
      { id: 'ap_cancelled', hostingOrgId: 'org1', schoolYear: '2026-2027', proposalStatus: 'approved', status: 'cancelled' },
      // Prior SY should not be counted
      { id: 'ap_old_approved', hostingOrgId: 'org1', schoolYear: '2025-2026', proposalStatus: 'approved' },
      { id: 'ap_old_pending', hostingOrgId: 'sas_admin', schoolYear: '2025-2026', proposalStatus: 'pending' },
    ];

    const liquidations = [
      // Current SY FLs waiting signatory approval (Org + SAS, including via parentEvent SY)
      { id: 'fl_org_pending', eventId: 'ap_org_approved', status: 'pending' },
      { id: 'fl_sas_under_review', eventId: 'ap_sas_chain', status: 'under_review' },
      // Excluded FLs (approved, draft, returned, old SY)
      { id: 'fl_approved', schoolYear: '2026-2027', status: 'approved' },
      { id: 'fl_draft', schoolYear: '2026-2027', status: 'draft' },
      { id: 'fl_old', eventId: 'ap_old_approved', status: 'under_review' },
    ];

    const pars = [
      // Current SY PARs waiting signatory approval (Org + SAS)
      { id: 'par_org', eventId: 'ap_org_completed', status: 'under_review' },
      { id: 'par_sas', schoolYear: '2026-2027', status: 'pending', isSasInternal: true },
      // Excluded PARs
      { id: 'par_approved', schoolYear: '2026-2027', status: 'approved' },
      { id: 'par_old', schoolYear: '2025-2026', status: 'under_review' },
    ];

    const counts = computeDashboardKpiCounts({
      events,
      liquidations,
      pars,
      semesters,
      schoolYear: '2026-2027',
      availableSchoolYears: ['2026-2027', '2025-2026'],
    });

    assert.deepEqual(counts, {
      pendingActivityProposals: 2,
      approvedActivityProposals: 3,
      pendingFinancialLiquidations: 2,
      pendingPostActivityReports: 2,
    });
  });
});
