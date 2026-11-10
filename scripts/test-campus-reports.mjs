import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, entries: [] } });
let passed = 0;
try {
  const domain = await server.ssrLoadModule('/src/app/signatory/utils/campus-activity-report.ts');
  const dates = await server.ssrLoadModule('/src/app/modules/events/utils/activity-compliance.utils.ts');
  const { isEventLiquidationExempt } = await server.ssrLoadModule('/src/app/modules/events/utils/organization-display.utils.ts');
  const exports = await server.ssrLoadModule('/src/app/signatory/utils/campus-report-export.ts');
  const now = new Date('2026-11-10T08:00:00Z');
  const periods = [
    { id: 'college', academicYear: '2026-2027', semester: '1st Semester', academicLevel: 'COLLEGE', status: 'ACTIVE', label: 'College 2026 1S' },
    { id: 'shs', academicYear: '2026-2027', semester: '1st Trimester', academicLevel: 'SHS', status: 'ACTIVE', label: 'SHS 2026 1T' },
    { id: 'old', academicYear: '2025-2026', semester: '2nd Semester', academicLevel: 'COLLEGE', status: 'COMPLETED', label: 'College 2025 2S' },
  ];
  const organizations = [{ id: 'alpha', name: 'Alpha Club', acronym: 'ALPHA' }];
  const base = { id: 'act-1', title: 'Act 1', hostingOrgId: 'alpha', organizationId: 'alpha', schoolYear: '2026-2027', semesterId: 'college', targetAcademicLevel: 'COLLEGE', proposalStatus: 'completed', status: 'completed', totalApprovedBudget: 1000, sessions: [{ date: '2026-11-01', title: 'Session 1' }], referenceId: 'ACT-001' };
  const build = (input = {}) => domain.buildCampusActivityRows({ events: [base], organizations, periods, now, ...input });
  const test = async (name, body) => { await body(); passed++; console.log(`PASS: ${name}`); };
  await test('Funded concluded activities require FL and PAR without being cleared', () => {
    const [row] = build(); assert.equal(row.missingFL, true); assert.equal(row.missingPAR, true); assert.equal(row.fullyCleared, false);
    assert.equal(row.deadline, '2026-11-16'); assert.equal(row.daysRemaining, 6); assert.equal(row.overdue, false);
    assert.match(row.outstanding, /FL not submitted; PAR not submitted/);
  });
  await test('Zero-budget activities only require PAR and never become FL overdue', () => {
    const [row] = build({ events: [{ ...base, totalApprovedBudget: 0, fundingSource: 'zero_budget', sessions: [{ date: '2026-01-01' }] }] });
    assert.equal(row.flStatus, 'exempt'); assert.equal(row.missingFL, false); assert.equal(row.deadline, ''); assert.equal(row.overdue, false); assert.equal(row.missingPAR, true); assert.doesNotMatch(row.outstanding, /FL/);
  });
  await test('Positive budget, projections, or custodians override stale exemption flags', () => {
    for (const values of [{ totalApprovedBudget: 50 }, { budgetItems: [{ amount: 1 }] }, { financialProjections: { expenses: [{ thisYearProposed: 10 }] } }, { budgetCustodians: [{ allocatedAmount: 1 }] }]) {
      assert.equal(isEventLiquidationExempt({ fundingSource: 'zero_budget', liquidationRequired: false, ...values }), false);
    }
    assert.equal(isEventLiquidationExempt({ financialProjections: { expenses: [] } }), true);
    assert.equal(isEventLiquidationExempt({ liquidationRequired: true }), false);
  });
  await test('FL and PAR progress independently; both approvals are required to clear funded activity', () => {
    const par = { id: 'par-1', eventId: base.id, status: 'approved', attendanceSummary: { attendedCount: 0 } };
    const [pending] = build({ pars: [par], liquidations: [{ id: 'fl-1', eventId: base.id, status: 'under_review' }] });
    assert.equal(pending.parStatus, 'approved'); assert.equal(pending.fullyCleared, false); assert.equal(pending.missingPAR, false); assert.equal(pending.attendees, 0);
    assert.match(pending.outstanding, /Awaiting FL approval/);
    const [cleared] = build({ pars: [par], liquidations: [{ id: 'fl-1', eventId: base.id, status: 'approved' }] });
    assert.equal(cleared.fullyCleared, true);
    const [exempt] = build({ events: [{ ...base, totalApprovedBudget: 0 }], pars: [par] }); assert.equal(exempt.fullyCleared, true);
  });
  await test('A linked monetary liquidation prevents a stale activity mirror from becoming exempt', () => {
    const [row] = build({ events: [{ ...base, totalApprovedBudget: 0, fundingSource: 'zero_budget' }], liquidations: [{ id: 'fl-monetary', eventId: base.id, status: 'under_review', allocatedBudget: 500 }] });
    assert.equal(row.exempt, false); assert.equal(row.flStatus, 'under_review'); assert.equal(row.fullyCleared, false);
  });
  await test('Drafts remain unsubmitted, canonical returned statuses remain revisions', () => {
    const [draft] = build({ pars: [{ id: 'par', eventId: base.id, status: 'draft' }], liquidations: [{ id: 'fl', eventId: base.id, status: 'draft' }] });
    assert.equal(draft.missingFL, true); assert.equal(draft.missingPAR, true); assert.match(draft.outstanding, /draft not submitted/);
    const [returned] = build({ pars: [{ id: 'par', eventId: base.id, status: 'returned' }], liquidations: [{ id: 'fl', eventId: base.id, status: 'returned_for_revision' }] });
    assert.equal(returned.returned, true); assert.equal(returned.fullyCleared, false); assert.match(returned.outstanding, /FL needs revision; PAR needs revision/);
  });
  await test('Past schedule or a PAR alone never proves the activity was officially concluded', () => {
    const [row] = build({ events: [{ ...base, status: 'approved', proposalStatus: 'approved' }], pars: [{ id: 'draft-par', eventId: base.id, status: 'draft' }] });
    assert.equal(row.activityState, 'awaiting_conclusion'); assert.equal(row.concluded, false); assert.equal(row.missingFL, false); assert.equal(row.missingPAR, false); assert.equal(row.deadline, '');
  });
  await test('Upcoming and ongoing activities have no missing-document alerts', () => {
    for (const [date, state] of [['2026-11-11', 'upcoming'], ['2026-11-10', 'ongoing']]) {
      const [row] = build({ events: [{ ...base, status: 'approved', proposalStatus: 'approved', sessions: [{ date }] }] });
      assert.equal(row.activityState, state); assert.equal(row.flStatus, 'not_due'); assert.equal(row.parStatus, 'not_due');
    }
  });
  await test('Cancelled and rejected activities never generate report requirements', () => {
    for (const status of ['cancelled', 'rejected']) {
      const [row] = build({ events: [{ ...base, status, proposalStatus: status, completedAt: now }] });
      assert.equal(row.activityState, status); assert.equal(row.concluded, false); assert.equal(row.missingFL, false); assert.equal(row.missingPAR, false); assert.equal(row.returned, false);
      assert.equal(domain.campusActivityHighlights([row]).length, 0);
    }
  });
  await test('Join proposal, mirrored activity and latest reports by ID without duplicate rows', () => {
    const proposal = { id: 'proposal-1', title: 'Renamed activity', status: 'approved_president', organizationId: 'alpha' };
    const rows = build({ proposals: [proposal], events: [{ ...base, id: 'event-1', proposalId: proposal.id }, { ...base, id: proposal.id, proposalId: proposal.id }],
      pars: [{ id: 'old', eventId: 'event-1', status: 'approved', updatedAt: '2026-10-01' }, { id: 'new', eventId: proposal.id, status: 'returned', updatedAt: '2026-11-01' }, { id: 'void', eventId: proposal.id, status: 'voided', updatedAt: '2026-11-09' }] });
    assert.equal(rows.length, 1); assert.equal(rows[0].id, proposal.id); assert.equal(rows[0].par.id, 'new'); assert.equal(rows[0].parStatus, 'returned');
  });
  await test('Different activities with the same title never share reports', () => {
    const rows = build({ events: [base, { ...base, id: 'act-2' }], pars: [{ id: 'par', eventId: 'act-2', status: 'approved' }] });
    assert.equal(rows.find((row) => row.id === 'act-1').parStatus, 'missing'); assert.equal(rows.find((row) => row.id === 'act-2').parStatus, 'approved');
  });
  await test('Unified activity subscriptions and legacy mirrors still produce exactly one row', () => {
    const proposal = { ...base, id: 'proposal-root', status: 'approved_president' };
    const mirror = { ...base, id: 'legacy-event', proposalId: proposal.id };
    const rows = build({ proposals: [proposal, mirror], events: [proposal, mirror], pars: [{ id: 'par', eventId: mirror.id, status: 'approved' }] });
    assert.equal(rows.length, 1); assert.equal(rows[0].id, proposal.id); assert.equal(rows[0].par.id, 'par');
  });
  await test('Unmirrored submitted and returned proposals are included; drafts/deleted are omitted', () => {
    const rows = build({ events: [], proposals: ['under_review', 'returned_for_revision', 'draft'].map((status, index) => ({ ...base, id: `p-${index}`, status, proposalStatus: undefined })) });
    assert.equal(rows.length, 2); assert.ok(rows.some((row) => row.proposalStatus === 'returned'));
    assert.equal(build({ proposals: [{ ...base, status: 'draft' }] }).length, 0);
    assert.equal(build({ events: [{ ...base, isDeleted: true }] }).length, 0);
  });
  await test('Archived reports only count as approved when approval is recorded', () => {
    assert.equal(domain.documentStatus({ status: 'archived' }), 'archived');
    assert.equal(domain.documentStatus({ status: 'archived', approvedAt: now }), 'approved');
    const [row] = build({ pars: [{ id: 'p', eventId: base.id, status: 'archived' }] }); assert.equal(row.fullyCleared, false);
  });
  await test('Deadline uses stored value or actual conclusion, latest session, and campus day boundaries', () => {
    assert.equal(dates.liquidationSubmissionDeadline({ ...base, completedAt: '2026-11-02T23:00:00Z' }), '2026-11-18');
    assert.equal(dates.liquidationSubmissionDeadline(base, { submissionDeadline: '2026-12-01' }), '2026-12-01');
    assert.equal(dates.liquidationSubmissionDeadline({ ...base, sessions: [{ date: '2026-11-03' }, { date: '2026-10-01' }] }), '2026-11-18');
    assert.equal(dates.liquidationSubmissionDeadline({ ...base, sessions: [], createdAt: now }), '');
    assert.equal(dates.calendarDaysRemaining('2026-11-10', new Date('2026-11-10T15:59:59Z')), 0);
    assert.equal(dates.calendarDaysRemaining('2026-11-10', new Date('2026-11-10T16:00:00Z')), -1);
    assert.equal(dates.campusDateKey('2026-02-30'), '');
  });
  await test('Only missing/draft required FL becomes overdue; review is not a late submission', () => {
    const events = [{ ...base, sessions: [{ date: '2026-10-01' }] }];
    assert.equal(build({ events })[0].overdue, true);
    assert.equal(build({ events, liquidations: [{ id: 'f', eventId: base.id, status: 'under_review' }] })[0].overdue, false);
    assert.equal(build({ events, liquidations: [{ id: 'f', eventId: base.id, status: 'approved' }] })[0].overdue, false);
  });
  await test('Activity title uses linked activity and supports both stored title fields', () => {
    assert.equal(dates.resolveActivityName({ eventId: base.id, eventTitle: 'Old name' }, [base]), 'Act 1');
    assert.equal(dates.resolveActivityName({ eventTitle: 'Stored title' }), 'Stored title');
    assert.equal(dates.resolveActivityName({ activityTitle: 'Legacy title' }), 'Legacy title');
    assert.equal(dates.resolveActivityName({}), 'Unnamed activity');
  });
  const allRows = build({ events: [base, { ...base, id: 'shs-act', title: 'SHS Activity', semesterId: 'shs', targetAcademicLevel: 'SHS', totalApprovedBudget: 0 }, { ...base, id: 'old-act', semesterId: 'old', schoolYear: '2025-2026', sessions: [{ date: '2026-03-01' }] }] });
  const filter = (changes) => domain.filterCampusActivityRows(allRows, { ...domain.DEFAULT_CAMPUS_FILTERS, ...changes }, periods);
  await test('Active default includes College and SHS periods and filters historical years correctly', () => {
    assert.equal(filter({}).length, 2); assert.equal(filter({ scope: 'SHS' })[0].id, 'shs-act');
    assert.equal(filter({ period: 'ALL', academicYear: '2025-2026' })[0].id, 'old-act');
    assert.equal(filter({ period: 'old' })[0].id, 'old-act'); assert.equal(filter({ period: 'ALL', semester: '1st Trimester' }).length, 1);
  });
  await test('Every filter and summary uses the same activity rows', () => {
    assert.equal(filter({ quick: 'missing_fl' }).length, 1); assert.equal(filter({ quick: 'missing_par' }).length, 2);
    assert.equal(filter({ flStatus: 'exempt' })[0].id, 'shs-act'); assert.equal(filter({ search: 'SHS Activity' }).length, 1);
    assert.equal(filter({ startDate: '2026-11-02' }).length, 0); assert.equal(filter({ organizationId: 'sas' }).length, 0);
    assert.equal(filter({ activityState: 'concluded', proposalStatus: 'approved', parStatus: 'missing' }).length, 2);
    assert.deepEqual(domain.campusActivitySummary(filter({})), { total: 2, concluded: 2, missingPAR: 2, missingFL: 1, returned: 0, cleared: 0 });
  });
  await test('Any scheduled session can match a date filter without duplicating the activity', () => {
    const [row] = build({ events: [{ ...base, sessions: [{ date: '2026-11-01' }, { date: '2026-11-08' }, { date: '2026-11-01' }] }] });
    assert.equal(row.dates.length, 2);
    assert.equal(domain.filterCampusActivityRows([row], { ...domain.DEFAULT_CAMPUS_FILTERS, startDate: '2026-11-08', endDate: '2026-11-08' }, periods).length, 1);
  });
  await test('Unknown actual attendance remains unavailable; estimates never become verified attendees', () => {
    assert.equal(build({ events: [{ ...base, expectedParticipantCount: 200, estAttendanceCount: 100 }] })[0].attendees, null);
  });
  await test('Highlights prioritize overdue/missing requirements and exclude exempt FL', () => {
    const highlights = domain.campusActivityHighlights(allRows);
    assert.equal(highlights[0].row.id, 'old-act');
    assert.doesNotMatch(highlights.find((item) => item.row.id === 'shs-act').message, /FL/);
  });
  await test('CSV exports exactly the filtered rows, filter metadata, counts and safe quoted cells', () => {
    const filters = { ...domain.DEFAULT_CAMPUS_FILTERS, quick: 'missing_fl' };
    const selected = domain.filterCampusActivityRows(allRows, filters, periods);
    const snapshot = exports.campusReportSnapshot(selected, filters, periods, organizations, 'Test Signatory', now);
    const csv = exports.campusReportCSV(snapshot);
    assert.equal(snapshot.rows.length, 1); assert.equal(snapshot.summary.total, 1); assert.match(csv, /Quick filter: Missing FL/); assert.match(csv, /Act 1/); assert.doesNotMatch(csv, /SHS Activity/);
    snapshot.rows = [['=HYPERLINK("bad")', 'Comma, and "quotes"']];
    assert.ok(exports.campusReportCSV(snapshot).includes('"\'=HYPERLINK(""bad"")"'));
    assert.ok(exports.campusReportCSV(snapshot).includes('"Comma, and ""quotes"""'));
  });
  await test('PDF export paginates all 70 filtered records and retains the final record', async () => {
    const snapshot = exports.campusReportSnapshot(allRows, { ...domain.DEFAULT_CAMPUS_FILTERS, period: 'ALL' }, periods, organizations, 'Test Signatory', now);
    snapshot.rows = Array.from({ length: 70 }, (_, index) => [`PDF activity ${index + 1}`, ...snapshot.rows[0].slice(1)]);
    const pdf = await exports.createCampusReportPDF(snapshot);
    assert.ok(pdf.getNumberOfPages() > 1); assert.match(pdf.output(), /PDF activity 70/); assert.match(pdf.output(), /Quick filter: All/);
  });
  console.log(`\n${passed} campus report domain/export tests passed.`);
} finally { await server.close(); }
