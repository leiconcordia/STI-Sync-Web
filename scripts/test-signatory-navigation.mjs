import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Window } from 'happy-dom';
import { createServer } from 'vite';

const browser = new Window({ url: 'http://localhost/signatory/dashboard' });
for (const key of ['window', 'document', 'navigator', 'localStorage', 'sessionStorage', 'HTMLElement', 'HTMLInputElement', 'HTMLSelectElement', 'HTMLTextAreaElement', 'Element', 'Node', 'NodeFilter', 'MutationObserver', 'CustomEvent', 'Event', 'KeyboardEvent', 'MouseEvent', 'DocumentFragment', 'HTMLFormElement', 'HTMLButtonElement', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'ResizeObserver']) {
  const value = browser[key];
  if (value !== undefined) Object.defineProperty(globalThis, key, { configurable: true, value: typeof value === 'function' && ['getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame'].includes(key) ? value.bind(browser) : value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = await import('react');
const { act } = React;
const { createRoot } = await import('react-dom/client');
const day = (offset = 0) => {
  const date = new Date(); date.setDate(date.getDate() + offset);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
};
const session = { id: 'sig-1', uid: 'sig-1', name: 'Test Signatory', email: 'signatory@example.test', role: 'school_president', roleTitle: 'School President', applicableWorkflows: ['proposal', 'liquidation', 'par'], signatureUrl: 'data:image/png;base64,aA==', requiresPasswordChange: false };
const chain = (status = 'current', stageIndex = 1, uid = session.id) => [{ step: 1, stageIndex, role: uid === session.id ? session.role : 'sas_coordinator', roleTitle: uid === session.id ? session.roleTitle : 'SAS Coordinator', signatoryUid: uid, signatoryName: uid === session.id ? session.name : 'Other Reviewer', signatoryEmail: uid === session.id ? session.email : 'other@example.test', status }];
const event = (id, title, options = {}) => ({ id, title, referenceId: `ACT-${id}`, hostingOrgId: 'alpha', organizationId: 'alpha', organizationName: 'Alpha Club', semesterId: 'college', schoolYear: '2026-2027', targetAcademicLevel: 'COLLEGE', status: 'completed', proposalStatus: 'completed', completedAt: `${day(-5)}T04:00:00Z`, totalApprovedBudget: 1000, sessions: [{ id: `${id}-session-1`, title: 'Main session', date: day(-5), startTime: '09:00', endTime: '12:00', venueName: 'Campus Hall' }], isOfficerProposal: true, ...options });
const events = [
  event('funded', 'Act 1 Funded Missing'),
  event('exempt', 'Act 2 Zero Budget', { totalApprovedBudget: 0, fundingSource: 'zero_budget', semesterId: 'shs', targetAcademicLevel: 'SHS' }),
  event('review', 'Act 3 Under Review'), event('revision', 'Act 4 Returned'),
  event('cleared', 'Act 5 Fully Cleared', { totalApprovedBudget: 0, fundingSource: 'zero_budget' }),
  event('upcoming', 'Act 6 Multiple Sessions', { status: 'approved', proposalStatus: 'approved', completedAt: null, sessions: [{ id: 'session-a', date: day(1), title: 'First session', startTime: '09:00', endTime: '11:00', venueName: 'Lab' }, { id: 'session-b', date: day(5), title: 'Second session', startTime: '09:00', endTime: '11:00', venueName: 'Lab' }] }),
  event('ongoing', 'Act 7 Today', { status: 'approved', proposalStatus: 'approved', completedAt: null, sessions: [{ id: 'today-session', date: day(), startTime: '09:00', endTime: '16:00', venueName: 'Campus Hall' }] }),
  event('future', 'Act 8 Future Stage', { status: 'under_review', proposalStatus: 'pending', completedAt: null }),
  event('pending-ap', 'Act 9 Pending Proposal', { status: 'under_review', proposalStatus: 'pending', completedAt: null }),
];
const proposals = events.map((record) => ({ ...record, referenceNo: `AP-${record.id}`, status: record.status === 'under_review' ? 'under_review' : 'approved_president', currentStageIndex: 1, currentStepIndex: 0, approvalChain: record.status === 'under_review' ? chain() : chain('approved'), financialProjections: { totalRevenue: 0, totalExpenses: record.totalApprovedBudget, revenues: [], expenses: [] }, targetAudience: { academicLevels: record.targetAcademicLevel === 'SHS' ? ['SHS'] : ['College'], departments: [], yearLevels: [] }, objectives: [], successIndicators: [], organizingBody: [], mechanics: [], materials: [], marketingPlan: [] }));
proposals.find((record) => record.id === 'future').approvalChain = [...chain('current', 1, 'earlier-reviewer'), ...chain('waiting', 2)];
const liquidation = (id, eventId, status, approvalChain) => ({ id, eventId, eventTitle: events.find((record) => record.id === eventId).title, referenceNo: `LF-${id}`, organizationId: 'alpha', organizationName: 'Alpha Club', allocatedBudget: 1000, totalActualSpending: 750, surplusOrDeficit: 250, lineItems: [], status, approvalChain, currentStageIndex: 1, currentStepIndex: 0, createdByName: 'Test Officer' });
const par = (id, eventId, status, approvalChain) => ({ id, eventId, eventTitle: events.find((record) => record.id === eventId).title, referenceNo: `PAR-${id}`, organizationId: 'alpha', organizationName: 'Alpha Club', eventVenue: 'Campus Hall', eventDateFormatted: day(-5), eventDescription: 'Verified campus activity report.', attendanceSummary: { attendedCount: 24, registeredCount: 30, targetAudience: 'Students', whoAttended: 'Students' }, financialSummary: { totalRevenue: 0, totalDisbursed: 750, surplusOrDeficit: 250, lineItems: [] }, results: { objectiveStatus: 'fully_achieved', achievementNarrative: 'Objectives achieved.', keyLearnings: [], objectiveAssessments: [] }, recommendations: {}, photos: [], preparedBy: { name: 'Test Officer', roleTitle: 'President' }, status, approvalChain, currentStageIndex: 1, currentStepIndex: 0 });
const fixture = globalThis.campusFixture = {
  session, auth: { currentUser: null }, authCalls: [], listeners: new Set(), writes: [], downloads: [], failCollections: new Set(),
  collections: {
    activities: events.map((record) => ({ ...proposals.find((proposal) => proposal.id === record.id), ...record, approvalChain: proposals.find((proposal) => proposal.id === record.id).approvalChain, currentStageIndex: 1, currentStepIndex: 0 })), events, activity_proposals: proposals,
    liquidations: [liquidation('fl-review', 'review', 'under_review', chain()), liquidation('fl-returned', 'revision', 'returned', chain('returned'))],
    post_activity_reports: [par('par-review', 'review', 'approved', chain('approved')), par('par-returned', 'revision', 'returned', chain('returned')), par('par-cleared', 'cleared', 'approved', chain('approved'))],
    organizations: [{ id: 'alpha', name: 'Alpha Club', acronym: 'ALPHA', status: 'active', typeId: 'college' }],
    semesters: [{ id: 'college', academicYear: '2026-2027', semester: '1st Semester', academicLevel: 'COLLEGE', status: 'ACTIVE', label: 'College Active Term', archived: false }, { id: 'shs', academicYear: '2026-2027', semester: '1st Trimester', academicLevel: 'SHS', status: 'ACTIVE', label: 'SHS Active Term', archived: false }],
  },
};
const liteFirestore = globalThis.campusFirestoreOriginal = await import('firebase/firestore/lite');
const authSDK = globalThis.campusAuthOriginal = await import('firebase/auth');
const authFixture = Object.keys(authSDK).filter((name) => /^[A-Za-z_$][\w$]*$/.test(name) && name !== 'default' && !['onAuthStateChanged', 'signOut', 'signInWithEmailAndPassword'].includes(name)).map((name) => `export const ${name} = globalThis.campusAuthOriginal.${name};`).join('\n') + `
  const state = globalThis.campusFixture;
  export const onAuthStateChanged = (_auth, callback) => { void callback(state.auth.currentUser); return () => {}; };
  export const signOut = async () => { state.auth.currentUser = null; };
  export const signInWithEmailAndPassword = async (_auth, email, password) => { state.authCalls.push({ email, password }); if (password !== 'ExistingPassword!') throw new Error('Wrong password'); state.auth.currentUser = { uid: 'shared-auth', email }; return { user: state.auth.currentUser }; };
`;
const overriddenFirestoreExports = new Set(['collection', 'doc', 'query', 'getDoc', 'getDocs', 'setDoc', 'updateDoc', 'deleteDoc', 'addDoc']);
const firestoreFixture = Object.keys(liteFirestore).filter((name) => /^[A-Za-z_$][\w$]*$/.test(name) && name !== 'default' && !overriddenFirestoreExports.has(name)).map((name) => `export const ${name} = globalThis.campusFirestoreOriginal.${name};`).join('\n') + `
  const state = globalThis.campusFixture;
  export const collection = (_db, ...segments) => ({ path: segments.join('/'), id: segments.at(-1) });
  export const doc = (_db, ...segments) => ({ path: segments.join('/'), id: segments.at(-1) });
  export const query = (ref) => ref;
  const snapshot = (ref) => {
    const [name, id] = ref.path.split('/');
    const data = name === 'institutional_signatories' ? state.session : state.collections[name]?.find((record) => record.id === id);
    const records = id ? (data ? [data] : []) : state.collections[name] || [];
    const docs = records.map((record) => ({ id: record.id, data: () => record, exists: () => true }));
    return { id, exists: () => Boolean(data), data: () => data, docs, forEach: (callback) => docs.forEach(callback), empty: !records.length, size: records.length };
  };
  export const onSnapshot = (ref, next, error) => {
    const notify = () => state.failCollections.has(ref.path) ? error?.(new Error('Fixture read failure')) : next(snapshot(ref));
    state.listeners.add(notify); notify(); return () => state.listeners.delete(notify);
  };
  export const getDoc = async (ref) => snapshot(ref);
  export const getDocs = async (ref) => snapshot(ref);
  const noWrite = (...args) => { state.writes.push(args); throw new Error('Navigation tests must never write to the database'); };
  export const setDoc = noWrite; export const updateDoc = noWrite; export const deleteDoc = noWrite; export const addDoc = noWrite;
`;
const server = await createServer({
  configFile: false, appType: 'custom', server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, entries: [] }, esbuild: { jsx: 'automatic' },
  resolve: { alias: [{ find: '@', replacement: path.resolve('src') }, { find: /^firebase\/firestore$/, replacement: '\0campus-firestore' }] },
  ssr: { noExternal: ['firebase'] },
  plugins: [{ name: 'campus-navigation-fixtures', enforce: 'pre', resolveId(source) {
    const normalized = source.replaceAll('\\', '/').replace(/\.(tsx?|mjs)$/, '');
    if (source === 'firebase/firestore' || source === 'virtual:campus-firestore') return '\0campus-firestore';
    if (source === 'virtual:campus-auth') return '\0campus-auth';
    if (normalized.endsWith('/services/firebase')) return '\0campus-firebase';
    if (source.startsWith('figma:asset/')) return path.resolve('src/assets', source.slice('figma:asset/'.length));
  }, transform(source, id) {
    if (id.includes('/src/') && /\.[cm]?[jt]sx?$/.test(id)) return source.replace(/(['"])firebase\/firestore\1/g, "'virtual:campus-firestore'").replace(/(['"])firebase\/auth\1/g, "'virtual:campus-auth'");
  }, load(id) {
    if (id === '\0campus-firestore') return firestoreFixture;
    if (id === '\0campus-auth') return authFixture;
    if (id === '\0campus-firebase') return 'export const db = {}; export const auth = globalThis.campusFixture.auth; export const functions = {}; export const storage = {};';
  } }],
});
const errors = [];
const originalError = console.error;
console.error = (...args) => { errors.push(args.map(String).join(' ')); originalError(...args); };
const originalCreateURL = URL.createObjectURL;
const originalRevokeURL = URL.revokeObjectURL;
URL.createObjectURL = (blob) => { fixture.downloads.push({ blob }); return `blob:campus-fixture/${fixture.downloads.length}`; };
URL.revokeObjectURL = () => {};
document.addEventListener('click', (event) => {
  const link = event.target.closest?.('a[download]');
  if (link) { event.preventDefault(); fixture.downloads.at(-1).filename = link.download; }
}, true);
localStorage.setItem('sti_sync_signatory_session', JSON.stringify(session));
let root;
let appRouter;
let originalRouter;
let passed = 0;
try {
  // Match Vite SSR's CommonJS condition; Node 24's module-sync entry has a separate context.
  const { RouterProvider, createMemoryRouter } = await import(pathToFileURL(path.resolve('node_modules/react-router/dist/development/index.js')).href);
  // Use the actual application route definitions, layouts, pages and review modals.
  ({ router: originalRouter } = await server.ssrLoadModule('/src/app/routes.tsx'));
  originalRouter.dispose();
  appRouter = createMemoryRouter(originalRouter.routes, { initialEntries: ['/signatory/dashboard'] });
  const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  const flush = async (body) => act(async () => { await body?.(); await new Promise(setImmediate); });
  await flush(() => root.render(React.createElement(RouterProvider, { router: appRouter })));
  const test = async (name, body) => { await body(); assert.equal(appRouter.state.errors, null, `${name}: route errors`); passed++; console.log(`PASS: ${name}`); };
  const click = async (button) => { assert.ok(button, 'Expected an available control'); await flush(() => button.click()); };
  const button = (text) => [...host.querySelectorAll('button')].find((item) => item.textContent.trim() === text);
  const nav = async (url) => { const link = host.querySelector(`a[href="${url}"]`); await click(link); assert.equal(appRouter.state.location.pathname, url); };
  const rows = () => [...host.querySelectorAll('tr[data-activity-id]')];
  const select = async (label, value) => {
    const input = host.querySelector(`select[aria-label="${label}"]`); assert.ok(input, label);
    await flush(() => { input.value = value; input.dispatchEvent(new Event('change', { bubbles: true })); });
  };
  await test('Dashboard mounts the campus calendar and highlights without the removed hub', async () => {
    assert.match(host.textContent, /Calendar of Activities/); assert.match(host.textContent, /Activity Highlights/); assert.doesNotMatch(host.textContent, /Document Hub & Governance/);
    const exemptHighlight = [...host.querySelectorAll('button')].find((item) => item.textContent.includes('Act 2 Zero Budget'));
    assert.match(exemptHighlight.textContent, /PAR not submitted/); assert.doesNotMatch(exemptHighlight.textContent, /FL not submitted/);
  });
  await test('Dashboard calendar opens the matching activity report and session details', async () => {
    const view = [...host.querySelectorAll('button')].find((item) => item.textContent.trim() === 'View Activity');
    await click(view); assert.equal(appRouter.state.location.pathname, '/signatory/reports');
    assert.equal(new URLSearchParams(appRouter.state.location.search).get('activity'), 'ongoing');
    assert.equal(host.querySelector('[role="dialog"] h2')?.textContent, 'Act 7 Today');
    await click(host.querySelector('button[aria-label="Close activity details"]'));
    assert.equal(host.querySelector('[aria-labelledby="campus-activity-title"]'), null);
  });
  await test('Campus report mounts all activity stages and applies quick filters without errors', async () => {
    assert.equal(rows().length, 9); await click(button('Missing FL')); assert.equal(rows().length, 1); assert.equal(rows()[0].dataset.activityId, 'funded');
    await click(button('Missing PAR')); assert.equal(rows().length, 2);
    await click(button('Fully Cleared')); assert.equal(rows().length, 1); assert.equal(rows()[0].dataset.activityId, 'cleared');
    await click(button('Awaiting My Signature')); assert.ok(rows().some((row) => row.dataset.activityId === 'review')); assert.ok(!rows().some((row) => row.dataset.activityId === 'future'));
    await click(button('Reset filters'));
  });
  await test('Academic scope, document status and reset controls update the report', async () => {
    await select('Academic scope', 'SHS'); assert.equal(rows().length, 1); assert.equal(rows()[0].dataset.activityId, 'exempt');
    await click(button('Reset filters')); await select('FL status', 'returned'); assert.equal(rows().length, 1); assert.equal(rows()[0].dataset.activityId, 'revision');
    await click(button('Reset filters')); assert.equal(rows().length, 9);
  });
  await test('CSV download contains only the filtered rows and the selected filter metadata', async () => {
    await click(button('Missing FL')); await click(button('Export CSV'));
    const download = fixture.downloads.at(-1); assert.match(download.filename, /Campus_Activity_Compliance_.*\.csv/);
    const csv = await download.blob.text(); assert.match(csv, /Act 1 Funded Missing/); assert.doesNotMatch(csv, /Act 2 Zero Budget/); assert.match(csv, /Quick filter: Missing FL/);
    await click(button('Reset filters'));
  });
  await test('Future-stage documents expose status summaries without opening their locked proposal', async () => {
    await click(host.querySelector('button[aria-label="View activity Act 8 Future Stage"]'));
    const dialog = host.querySelector('[aria-labelledby="campus-activity-title"]'); assert.ok(dialog); assert.ok(![...dialog.querySelectorAll('button')].some((item) => item.textContent === 'View Proposal'));
    await click(host.querySelector('button[aria-label="Close activity details"]'));
  });
  await test('Authorized linked FL, PAR and proposal review modals render without missing imports', async () => {
    await click(host.querySelector('button[aria-label="View activity Act 3 Under Review"]'));
    await click(button('View FL')); assert.match(host.textContent, /Financial Liquidation/);
    await flush(() => appRouter.navigate('/signatory/reports'));
    await click(host.querySelector('button[aria-label="View activity Act 3 Under Review"]')); await click(button('View PAR'));
    assert.match(host.textContent, /Post-Activity Report/);
    await flush(() => appRouter.navigate('/signatory/reports'));
    await click(host.querySelector('button[aria-label="View activity Act 9 Pending Proposal"]')); await click(button('View Proposal')); assert.match(host.textContent, /Proposal/);
    await flush(() => appRouter.navigate('/signatory/reports'));
  });
  await test('FL table shows Activity Name in pending, signed and returned views', async () => {
    await nav('/signatory/liquidations'); assert.match(host.querySelector('thead').textContent, /Activity Name/); assert.match(host.querySelector('tbody').textContent, /Act 3 Under Review/);
    await click([...host.querySelectorAll('button')].find((item) => item.textContent.startsWith('Returned for Revision'))); assert.match(host.querySelector('tbody').textContent, /Act 4 Returned/);
    await click([...host.querySelectorAll('button')].find((item) => item.textContent.startsWith('Signed History'))); assert.ok(host.querySelector('table'));
  });
  await test('PAR table displays canonical stored activity titles and returned records', async () => {
    await nav('/signatory/post-activity-reports'); assert.match(host.querySelector('thead').textContent, /Activity Name/);
    await click([...host.querySelectorAll('button')].find((item) => item.textContent.startsWith('Signed History'))); assert.match(host.querySelector('tbody').textContent, /Act 5 Fully Cleared/);
    await click([...host.querySelectorAll('button')].find((item) => item.textContent.startsWith('Returned for Revision'))); assert.match(host.querySelector('tbody').textContent, /Act 4 Returned/);
    assert.doesNotMatch(host.textContent, /undefined/);
  });
  await test('All signatory sidebar destinations navigate using actual app routes', async () => {
    await nav('/signatory/proposals'); assert.match(host.textContent, /Act 9 Pending Proposal/);
    await nav('/signatory/account'); assert.match(host.textContent, /Test Signatory/);
    await nav('/signatory/dashboard'); await nav('/signatory/reports'); assert.equal(rows().length, 9);
  });
  await test('Failed source reads show an error and disable compliance exports', async () => {
    fixture.failCollections.add('post_activity_reports'); await flush(() => [...fixture.listeners].forEach((notify) => notify()));
    assert.match(host.querySelector('[role="alert"]').textContent, /Unable to load campus records/); assert.equal(button('Export CSV').disabled, true);
    fixture.failCollections.clear(); await flush(() => [...fixture.listeners].forEach((notify) => notify()));
    assert.equal(rows().length, 9);
  });
  await test('Accountant scope preserves campus summaries and blocks proposal/PAR document routes', async () => {
    fixture.session = { ...session, role: 'accountant', roleTitle: 'Accountant', applicableWorkflows: ['liquidation'] };
    await flush(() => [...fixture.listeners].forEach((notify) => notify()));
    await flush(() => appRouter.navigate('/signatory/post-activity-reports')); assert.equal(appRouter.state.location.pathname, '/signatory/liquidations');
    await nav('/signatory/reports'); assert.equal(rows().length, 9);
    await click(host.querySelector('button[aria-label="View activity Act 3 Under Review"]'));
    const dialog = host.querySelector('[aria-labelledby="campus-activity-title"]'); assert.ok(![...dialog.querySelectorAll('button')].some((item) => item.textContent === 'View PAR'));
  });
  const workspaceService = await server.ssrLoadModule('/src/app/auth/services/portal-workspace.service.ts');
  const sharedUser = { uid: 'shared-auth', email: session.email };
  const sharedSignatory = { ...session, authUid: sharedUser.uid, firstName: 'John', middleName: 'Sigmund', lastName: 'Doe', isActive: true };
  const sharedAdviser = { id: 'shared-adviser', authUid: sharedUser.uid, email: sharedUser.email, organizationId: 'alpha', firstName: 'John', middleName: 'Sigmund', lastName: 'Doe', employeeId: 'FAC-001', isActive: true };
  const workspaceData = { signatories: [sharedSignatory], advisers: [sharedAdviser], officers: [], students: [], organizations: fixture.collections.organizations };
  await test('One account has separate adviser and signatory workspaces with no copied credentials', async () => {
    const choices = workspaceService.buildPortalWorkspaces(workspaceData, sharedUser);
    assert.equal(choices.length, 2); assert.deepEqual(choices.map((item) => item.kind), ['signatory', 'adviser']);
    assert.equal(choices[0].session.name, 'John S. Doe'); assert.equal(choices[1].session.studentName, 'John S. Doe');
    assert.equal(choices[1].session.isAdviser, true); assert.equal(choices[1].session.isSignatory, false);
    assert.doesNotMatch(JSON.stringify(choices), /tempPass|temporaryPassword/);
  });
  await test('Workspace selection excludes revoked roles, inactive clubs and another Auth UID', async () => {
    for (const invalid of [{ ...sharedAdviser, authUid: 'someone-else' }, { ...sharedAdviser, isActive: false }, { ...sharedAdviser, status: 'revoked' }]) {
      assert.equal(workspaceService.buildPortalWorkspaces({ ...workspaceData, advisers: [invalid] }, sharedUser).length, 1);
    }
    assert.equal(workspaceService.buildPortalWorkspaces({ ...workspaceData, organizations: [{ id: 'alpha', status: 'suspended' }] }, sharedUser).length, 1);
    const inactivePending = { ...sharedAdviser, isActive: false, requiresPasswordChange: true };
    assert.equal(workspaceService.buildPortalWorkspaces({ ...workspaceData, advisers: [inactivePending] }, sharedUser)[0].session.requiresPasswordChange, false);
  });
  await test('Legacy student-ID officer roles remain available to the verified student account', async () => {
    const choices = workspaceService.buildPortalWorkspaces({ signatories: [], advisers: [], officers: [{ id: 'officer', organizationId: 'alpha', studentId: '2026-001', roleId: 'president', isActive: true }], students: [{ authUid: sharedUser.uid, email: sharedUser.email, studentId: '2026-001', firstName: 'John', lastName: 'Doe' }], organizations: workspaceData.organizations }, sharedUser);
    assert.equal(choices.length, 1); assert.equal(choices[0].kind, 'officer'); assert.equal(choices[0].session.activeRoleId, 'president');
  });
  await test('Login with the existing password opens a workspace picker for the shared account', async () => {
    fixture.session = sharedSignatory; fixture.collections.institutional_signatories = [sharedSignatory]; fixture.collections.organization_advisers = [sharedAdviser];
    await flush(() => appRouter.navigate('/portal/login'));
    const type = async (input, value) => flush(() => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); });
    await type(host.querySelector('input[type="text"]'), sharedUser.email); await type(host.querySelector('input[type="password"]'), 'ExistingPassword!');
    await click(button('Sign In to Organization Portal'));
    assert.equal(appRouter.state.location.pathname, '/portal/workspaces'); assert.match(host.textContent, /Choose your workspace/);
    assert.match(host.textContent, /Institutional Signatory/); assert.match(host.textContent, /Club Adviser/); assert.match(host.textContent, /Alpha Club/);
    assert.deepEqual(fixture.authCalls.at(-1), { email: sharedUser.email, password: 'ExistingPassword!' });
  });
  await test('The adviser workspace opens its dashboard and switches back to the signatory workspace', async () => {
    await click([...host.querySelectorAll('button')].find((item) => item.textContent.includes('Club Adviser')));
    assert.equal(appRouter.state.location.pathname, '/officer/dashboard');
    assert.equal(JSON.parse(localStorage.getItem('sti_sync_officer_session')).isAdviser, true); assert.equal(localStorage.getItem('sti_sync_signatory_session'), null);
    await click(button('Switch Workspace')); assert.equal(appRouter.state.location.pathname, '/portal/workspaces');
    await click(button('Institutional Signatory')); assert.equal(appRouter.state.location.pathname, '/signatory/dashboard');
    assert.equal(JSON.parse(localStorage.getItem('sti_sync_signatory_session')).authUid, sharedUser.uid);
    await click(button('Switch Workspace')); assert.match(host.textContent, /Choose your workspace/);
  });
  await test('An unauthenticated workspace route returns to login and cannot activate a cached workspace', async () => {
    const choices = workspaceService.buildPortalWorkspaces(workspaceData, sharedUser);
    fixture.auth.currentUser = null;
    assert.throws(() => workspaceService.activatePortalWorkspace(choices[0]), /does not belong/);
    await flush(() => appRouter.navigate('/portal/login')); await flush(() => appRouter.navigate('/portal/workspaces'));
    assert.equal(appRouter.state.location.pathname, '/portal/login');
  });
  assert.equal(fixture.writes.length, 0, 'No live or mocked database writes during navigation');
  assert.deepEqual(errors, [], 'No React/runtime/import errors during navigation');
  console.log(`\n${passed} actual-route navigation and interaction tests passed; no runtime errors or database writes.`);
} finally {
  if (root) await act(async () => root.unmount());
  appRouter?.dispose(); originalRouter?.dispose();
  console.error = originalError; URL.createObjectURL = originalCreateURL; URL.revokeObjectURL = originalRevokeURL;
  await server.close(); browser.happyDOM.abort(); delete globalThis.campusFixture; delete globalThis.campusFirestoreOriginal;
}
process.exit(0);
