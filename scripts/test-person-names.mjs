import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Window } from 'happy-dom';
import { createServer } from 'vite';

const browser = new Window({ url: 'http://localhost/' });
for (const key of ['window', 'document', 'navigator', 'localStorage', 'HTMLElement', 'HTMLInputElement', 'HTMLSelectElement', 'HTMLTextAreaElement', 'Element', 'Node', 'NodeFilter', 'MutationObserver', 'CustomEvent', 'Event', 'KeyboardEvent', 'MouseEvent', 'DocumentFragment', 'File', 'FileReader', 'DataTransfer', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'ResizeObserver']) {
  const value = browser[key];
  if (value !== undefined) Object.defineProperty(globalThis, key, { configurable: true, value: typeof value === 'function' && ['getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame'].includes(key) ? value.bind(browser) : value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = await import('react');
const { act } = React;
const { createRoot } = await import('react-dom/client');
const sdk = globalThis.nameTestSDK = await import('firebase/firestore/lite');
const fixture = globalThis.nameTestFixture = { store: new Map(), authAccounts: new Map(), failAccountCheck: false, failWrites: false, rollbacks: [], failReads: new Set(), sequence: 0, auth: 0, emails: [], profile: { uid: 'admin', firstName: 'John', middleName: 'Sigmund', lastName: 'Doe', displayName: 'John S. Doe', email: 'admin@example.test' } };
fixture.store.set('organization_types/college', { id: 'college', name: 'Academic Club', archived: false });
fixture.store.set('semesters/active', { id: 'active', academicYear: '2026-2027', semester: '1st Semester', academicLevel: 'COLLEGE', status: 'ACTIVE', archived: false });
const overrides = new Set(['collection', 'doc', 'query', 'where', 'orderBy', 'getDoc', 'getDocs', 'setDoc', 'updateDoc', 'deleteDoc', 'addDoc', 'writeBatch']);
const firestoreCode = Object.keys(sdk).filter((key) => /^[A-Za-z_$][\w$]*$/.test(key) && key !== 'default' && !overrides.has(key)).map((key) => `export const ${key} = globalThis.nameTestSDK.${key};`).join('\n') + `
  const state = globalThis.nameTestFixture;
  export const collection = (base, ...segments) => ({ path: [base.path, ...segments].filter(Boolean).join('/') });
  export const doc = (base, ...segments) => { const path = [base.path, ...(segments.length ? segments : ['record-' + (++state.sequence)])].filter(Boolean).join('/'); return { path, id: path.split('/').at(-1) }; };
  export const where = (field, op, value) => ({ field, op, value });
  export const orderBy = () => ({});
  export const query = (ref, ...constraints) => ({ ...ref, constraints });
  const snapshot = (ref) => {
    const data = state.store.get(ref.path);
    const docs = [...state.store].filter(([path, record]) => path.startsWith(ref.path + '/') && path.slice(ref.path.length + 1).indexOf('/') < 0 && (ref.constraints || []).every((item) => !item.field || item.op !== '==' || record[item.field] === item.value)).map(([path, record]) => ({ id: path.split('/').at(-1), data: () => record, exists: () => true, ref: { path } }));
    return { id: ref.id, data: () => data, exists: () => Boolean(data), docs, empty: !docs.length, size: docs.length };
  };
  export const getDoc = async (ref) => snapshot(ref); export const getDocs = async (ref) => { if (state.failReads.has(ref.path)) throw new Error('Fixture read failure'); return snapshot(ref); };
  export const onSnapshot = (ref, next, error) => { state.failReads.has(ref.path) ? error?.(new Error('Fixture read failure')) : next(snapshot(ref)); return () => {}; };
  export const setDoc = async (ref, data, options) => { state.store.set(ref.path, options?.merge ? { ...state.store.get(ref.path), ...data } : data); };
  export const updateDoc = async (ref, data) => setDoc(ref, data, { merge: true });
  export const deleteDoc = async (ref) => state.store.delete(ref.path);
  export const addDoc = async (ref, data) => { const result = doc(ref); await setDoc(result, data); return result; };
  export const writeBatch = () => { const writes = []; return { set: (...args) => writes.push(() => setDoc(...args)), update: (...args) => writes.push(() => updateDoc(...args)), delete: (...args) => writes.push(() => deleteDoc(...args)), commit: async () => { if (state.failWrites) throw new Error('Fixture write failure'); for (const write of writes) await write(); } }; };
`;
const emailSource = await readFile('src/services/email.service.ts', 'utf8');
const emailNames = [...emailSource.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(\w+)/g)].map((match) => match[1]);
const emailCode = emailNames.map((name) => `export const ${name} = async (...args) => { globalThis.nameTestFixture.emails.push({ name: '${name}', args }); return { success: true }; };`).join('\n');
const server = await createServer({
  configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, entries: [] }, esbuild: { jsx: 'automatic' },
  plugins: [{ name: 'name-fixtures', enforce: 'pre', resolveId(source) {
    const normalized = source.replaceAll('\\', '/').replace(/\.[cm]?[jt]sx?$/, '');
    if (source === 'virtual:name-firestore') return '\0name-firestore';
    if (normalized.endsWith('/services/firebase')) return '\0name-firebase';
    if (normalized.endsWith('/adviser-account.service')) return '\0name-account-check';
    if (normalized.endsWith('/services/email.service')) return '\0name-email';
    if (normalized.endsWith('/hooks/useAdviserProfile')) return '\0name-profile';
  }, transform(source, id) {
    if (id.includes('/src/') && /\.[cm]?[jt]sx?$/.test(id)) return source.replace(/(['"])firebase\/firestore\1/g, "'virtual:name-firestore'");
  }, load(id) {
    if (id === '\0name-firestore') return firestoreCode;
    if (id === '\0name-email') return emailCode;
    if (id === '\0name-account-check') return `export const checkAdviserAccount = async (email) => { const state = globalThis.nameTestFixture; if (state.failAccountCheck) throw new Error('Fixture account check unavailable'); return state.authAccounts.get(email.trim().toLowerCase()) || { exists: false }; };`;
    if (id === '\0name-profile') return 'export const useAdviserProfile = () => ({ profile: globalThis.nameTestFixture.profile, user: { uid: "admin" }, loading: false, error: null });';
    if (id === '\0name-firebase') return 'export const db = {}; export const auth = { currentUser: null }; export const storage = {}; export const functions = {}; export const sanitizeFirestorePayload = (data) => data; export const createSecondaryAuthUser = async (email) => { const state = globalThis.nameTestFixture; const uid = "auth-" + (++state.auth); state.authAccounts.set(email.trim().toLowerCase(), { exists: true, eligible: true, uid, email: email.trim().toLowerCase() }); return uid; }; export const rollbackSecondaryAuthUser = async (...args) => globalThis.nameTestFixture.rollbacks.push(args);';
  } }],
});
const errors = []; const originalError = console.error;
console.error = (...args) => { errors.push(args.map(String).join(' ')); originalError(...args); };
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;
URL.createObjectURL = () => 'blob:name-fixture/logo';
URL.revokeObjectURL = () => {};
let root; let host; let passed = 0;
const flush = async (body) => act(async () => { await body?.(); await new Promise(setImmediate); });
const test = async (name, body) => { await body(); passed++; console.log(`PASS: ${name}`); };
const mount = async (Component, props = {}) => {
  if (root) { await flush(() => root.unmount()); host.remove(); }
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await flush(() => root.render(React.createElement(Component, props)));
};
const click = async (control) => { assert.ok(control, 'Expected an available control'); await flush(() => control.click()); };
const button = (text) => [...host.querySelectorAll('button')].find((item) => item.textContent.trim() === text);
const inputByLabel = (text) => [...host.querySelectorAll('label')].find((label) => label.textContent.trim().toLowerCase().startsWith(text.toLowerCase()))?.parentElement.querySelector('input');
const type = async (input, value) => {
  assert.ok(input, 'Expected an input');
  const prototype = input.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  await flush(() => { Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); });
};
try {
  const names = await server.ssrLoadModule('/src/app/utils/name.utils.ts');
  const full = { firstName: 'John', middleName: 'Sigmund', lastName: 'Doe', name: 'John Sigmund Doe' };
  await test('Full middle names produce exactly one capital initial and period', () => {
    assert.equal(names.formatStructuredFullName('John', 'Doe', 'Sigmund'), 'John S. Doe');
    assert.equal(names.formatStructuredFullName('John', 'Doe', 'sigmund'), 'John S. Doe');
    assert.equal(names.formatStructuredFullName('John', 'Doe', 'S.'), 'John S. Doe');
    assert.equal(names.formatStructuredFullName('John', 'Doe', 'Sigmund Santos'), 'John S. Doe');
  });
  await test('Optional middle names and Unicode letters format cleanly', () => {
    for (const middle of ['', '   ', null, undefined, '...']) assert.equal(names.formatStructuredFullName('John', 'Doe', middle), 'John Doe');
    assert.equal(names.formatStructuredFullName('John', 'Doe', 'Ñicolas'), 'John Ñ. Doe');
  });
  await test('Compound first and last names retain their complete spelling and casing', () => {
    assert.equal(names.formatStructuredFullName('Mary Jane', 'de la Cruz', 'Santos'), 'Mary Jane S. de la Cruz');
  });
  await test('Structured fields preserve the complete middle name and derive compatible initial/display fields', () => {
    assert.deepEqual(names.structuredNameFields(full), { firstName: 'John', lastName: 'Doe', middleName: 'Sigmund', middleInitial: 'S.', name: 'John S. Doe' });
    assert.equal(names.structuredNameFields({ ...full, middleName: '' }).name, 'John Doe');
  });
  await test('Legacy initial-only and name-only records remain usable without inventing a full middle name', () => {
    assert.equal(names.structuredNameFields({ firstName: 'John', lastName: 'Doe', middleInitial: 'S.' }).name, 'John S. Doe');
    assert.equal(names.structuredNameFields({ name: 'John S. Doe' }).middleName, 'S.');
    assert.equal(names.structuredNameFields({ name: 'Mary Jane Doe' }).name, 'Mary Jane Doe');
    assert.equal(names.structuredNameFields({ name: 'John de la Cruz' }).name, 'John de la Cruz');
  });
  const signatories = await server.ssrLoadModule('/src/app/modules/signatories/services/signatory.service.ts');
  let signatoryId;
  await test('Signatory creation saves Sigmund in the profile and John S. Doe for signing labels', async () => {
    const result = await signatories.createInstitutionalSignatory({ ...full, email: 'john@example.test', role: 'program_head', roleTitle: 'Program Head' }, 'admin');
    assert.equal(result.success, true); signatoryId = result.id;
    const saved = fixture.store.get(`institutional_signatories/${signatoryId}`);
    assert.equal(saved.middleName, 'Sigmund'); assert.equal(saved.middleInitial, 'S.'); assert.equal(saved.name, 'John S. Doe');
  });
  await test('Signatory read/edit round trips retain the full middle name and clear optional names correctly', async () => {
    const list = await signatories.getInstitutionalSignatories(); assert.equal(list.find((item) => item.id === signatoryId).middleName, 'Sigmund');
    await signatories.updateSignatoryDetails(signatoryId, { middleName: 'Samuel' });
    assert.equal(fixture.store.get(`institutional_signatories/${signatoryId}`).middleName, 'Samuel');
    assert.equal(fixture.store.get(`institutional_signatories/${signatoryId}`).name, 'John S. Doe');
    await signatories.updateSignatoryDetails(signatoryId, { middleName: '' }); assert.equal(fixture.store.get(`institutional_signatories/${signatoryId}`).name, 'John Doe');
    await signatories.updateSignatoryDetails(signatoryId, { middleName: 'Sigmund' });
  });
  const sas = await server.ssrLoadModule('/src/app/modules/signatories/services/sas-signatory.service.ts');
  await test('SAS settings, institutional signatory sync and cache all retain the full middle name', async () => {
    await sas.saveSasSignatoryConfig({ ...full, roleTitle: 'SAS Head', email: 'sas@example.test' }, 'admin');
    for (const key of ['system_settings/sas_signatory', 'institutional_signatories/sas_coordinator']) {
      assert.equal(fixture.store.get(key).middleName, 'Sigmund'); assert.equal(fixture.store.get(key).middleInitial, 'S.'); assert.equal(fixture.store.get(key).name, 'John S. Doe');
    }
    assert.equal(sas.getCachedSasSignatoryConfig().middleName, 'Sigmund'); assert.equal((await sas.getSasSignatoryConfig()).middleName, 'Sigmund');
  });
  const organizations = await server.ssrLoadModule('/src/app/modules/organizations/services/organization.service.ts');
  const adviserIdentity = await server.ssrLoadModule('/src/app/modules/organizations/utils/adviser-identity.utils.ts');
  const adviserRecords = () => [...fixture.store].filter(([key]) => /^(organization_advisers|institutional_signatories|students|sas_admins)\//.test(key)).map(([key, value]) => ({ ...value, id: key.split('/').at(-1), sourceType: key.startsWith('organization_advisers/') ? 'adviser' : key.startsWith('students/') ? 'student' : key.startsWith('sas_admins/') ? 'admin' : 'signatory' }));
  const organizationRecords = () => [...fixture.store].filter(([key]) => key.startsWith('organizations/')).map(([key, value]) => ({ ...value, id: key.split('/').at(-1) }));
  const nameVerification = (candidate, excludeOrgId) => {
    const existing = adviserIdentity.collectAdviserIdentities(adviserRecords(), organizationRecords(), excludeOrgId);
    return adviserIdentity.adviserNameVerification(candidate, adviserIdentity.inspectAdviserIdentity(candidate, existing).matches);
  };
  await test('Full adviser name matches ignore casing and whitespace without comparing shortened labels', () => {
    assert.equal(adviserIdentity.adviserNamesMayMatch(full, { firstName: ' JOHN ', middleName: '  SIGMUND ', lastName: 'doe' }), true);
    assert.equal(adviserIdentity.adviserNamesMayMatch(full, { ...full, middleName: 'Samuel' }), false);
    assert.equal(adviserIdentity.adviserNamesMayMatch(full, { firstName: 'John', lastName: 'Doe', middleInitial: 'S.' }), true);
  });
  await test('Name matching deduplicates embedded profiles and excludes revoked or current assignments', () => {
    const records = [{ ...full, id: 'a', email: 'same@example.test', organizationId: 'other' }, { ...full, id: 'inactive', isActive: false }, { ...full, id: 'revoked', status: 'revoked' }, { ...full, id: 'current', organizationId: 'current' }];
    const orgs = [{ id: 'other', name: 'Other Club', adviser: records[0] }];
    assert.equal(adviserIdentity.collectAdviserIdentities(records, orgs, 'current').length, 1);
  });
  await test('Verification is invalidated when the candidate or matching roster changes', () => {
    const candidate = { ...full, email: 'new@example.test', employeeId: 'EMP-NEW' };
    const records = [{ ...full, id: 'existing', email: 'old@example.test' }];
    const review = adviserIdentity.adviserNameVerification(candidate, records);
    assert.equal(adviserIdentity.isAdviserNameVerified(candidate, records, review), true);
    assert.equal(adviserIdentity.isAdviserNameVerified({ ...candidate, email: 'changed@example.test' }, records, review), false);
    assert.equal(adviserIdentity.isAdviserNameVerified(candidate, [...records, { ...full, id: 'another' }], review), false);
  });
  await test('New club creation preserves adviser middle names in both embedded and adviser account records', async () => {
    const orgId = await organizations.createOrganization({ name: 'Test Club', acronym: 'TC', description: 'Test', typeId: 'college', departmentId: 'cross-departmental', academicYear: '2026-2027', semester: '1st Semester', adviser: { ...full, email: 'club-adviser@example.test', title: 'Club Adviser', departmentId: '', nameVerification: nameVerification({ ...full, email: 'club-adviser@example.test' }) } }, 'admin');
    assert.equal(fixture.store.get(`organizations/${orgId}`).adviser.middleName, 'Sigmund');
    const adviser = [...fixture.store].find(([key, value]) => key.startsWith('organization_advisers/') && value.organizationId === orgId)[1];
    assert.equal(adviser.middleName, 'Sigmund'); assert.equal(adviser.name, 'John S. Doe');
  });
  await test('Assigning a replacement adviser retains the complete middle name', async () => {
    fixture.store.set('organizations/replace', { name: 'Replace Club' });
    const candidate = { ...full, email: 'replacement@example.test' };
    const adviser = await organizations.assignOrRevokeOrganizationAdviser('replace', 'Replace Club', { action: 'assign', newAdviser: { ...candidate, nameVerification: nameVerification(candidate, 'replace') }, sendEmailNotice: false });
    assert.equal(adviser.middleName, 'Sigmund'); assert.equal(adviser.name, 'John S. Doe'); assert.equal(fixture.store.get('organizations/replace').adviser.middleName, 'Sigmund');
    assert.equal(adviser.nameVerification.verifiedBy, 'SAS Administrator');
  });
  await test('Unverified duplicate names cannot create credentials or revoke the current adviser', async () => {
    const previous = { name: 'Original Adviser', email: 'original@example.test' };
    fixture.store.set('organizations/guarded', { name: 'Guarded Club', adviser: previous });
    const authCount = fixture.auth;
    await assert.rejects(() => organizations.assignOrRevokeOrganizationAdviser('guarded', 'Guarded Club', { action: 'assign', newAdviser: { ...full, email: 'unverified@example.test' }, sendEmailNotice: false }), /verify that this is a different person/);
    assert.equal(fixture.auth, authCount); assert.deepEqual(fixture.store.get('organizations/guarded').adviser, previous);
  });
  await test('New club creation also requires name verification before provisioning any account', async () => {
    const candidate = { ...full, email: 'namesake@example.test', employeeId: 'EMP-NAMESAKE', title: 'Club Adviser', departmentId: '' };
    const payload = { name: 'Namesake Club', acronym: 'NC', description: 'Test', typeId: 'college', departmentId: 'cross-departmental', adviser: candidate };
    const authCount = fixture.auth;
    await assert.rejects(() => organizations.createOrganization(payload, 'admin'), /verify that this is a different person/);
    assert.equal(fixture.auth, authCount);
    const orgId = await organizations.createOrganization({ ...payload, adviser: { ...candidate, nameVerification: nameVerification(candidate) } }, 'admin');
    assert.equal(fixture.store.get(`organizations/${orgId}`).adviser.nameVerification.verifiedBy, 'admin');
  });
  await test('Name verification never bypasses a duplicate email or Employee ID', async () => {
    for (const candidate of [
      { ...full, email: 'CLUB-ADVISER@example.test' },
      { ...full, email: 'different@example.test', employeeId: 'emp-namesake' },
    ]) {
      const authCount = fixture.auth;
      await assert.rejects(() => organizations.assignOrRevokeOrganizationAdviser('blocked', 'Blocked Club', { action: 'assign', newAdviser: { ...candidate, nameVerification: nameVerification(candidate, 'blocked') }, sendEmailNotice: false }), /already belongs to/);
      assert.equal(fixture.auth, authCount);
    }
  });
  await test('Failed identity reads never create credentials or modify the current assignment', async () => {
    const authCount = fixture.auth; const before = fixture.store.get('organizations/guarded');
    fixture.failReads.add('organization_advisers');
    try {
      await assert.rejects(() => organizations.assignOrRevokeOrganizationAdviser('guarded', 'Guarded Club', { action: 'assign', newAdviser: { ...full, email: 'read-failure@example.test' }, sendEmailNotice: false }), /Fixture read failure/);
      assert.equal(fixture.auth, authCount); assert.equal(fixture.store.get('organizations/guarded'), before);
    } finally { fixture.failReads.clear(); }
  });
  await test('Selecting a signatory account assigns an adviser role without creating or resetting their login', async () => {
    const person = { firstName: 'Pat', middleName: 'Santos', lastName: 'Rivera', name: 'Pat S. Rivera', email: 'pat@example.test', employeeId: 'FAC-PAT', authUid: 'existing-pat', isActive: true };
    fixture.store.set('institutional_signatories/pat', person);
    fixture.store.set('organizations/reuse', { name: 'Reuse Club', status: 'active' });
    fixture.authAccounts.set(person.email, { exists: true, eligible: true, uid: person.authUid, email: person.email });
    const authCount = fixture.auth;
    const adviser = await organizations.assignOrRevokeOrganizationAdviser('reuse', 'Reuse Club', { action: 'assign', newAdviser: { ...person, existingAccountUid: person.authUid }, sendEmailNotice: true });
    assert.equal(fixture.auth, authCount); assert.equal(adviser.authUid, person.authUid); assert.equal(adviser.accountProvisioning, 'reused');
    assert.equal(adviser.requiresPasswordChange, false); assert.equal(adviser.tempPass, null); assert.equal(adviser.temporaryPassword, undefined);
    assert.equal(fixture.store.get('institutional_signatories/pat'), person);
    const message = fixture.emails.at(-1).args[0]; assert.equal(message.existingAccount, true); assert.equal(message.temporaryPassword, undefined);
  });
  await test('New organizations also reuse an eligible account and omit temporary credentials', async () => {
    const person = { firstName: 'Casey', lastName: 'Lopez', name: 'Casey Lopez', email: 'casey@example.test', employeeId: 'FAC-CASEY', existingAccountUid: 'existing-casey', title: 'Club Adviser', departmentId: '' };
    fixture.authAccounts.set(person.email, { exists: true, eligible: true, uid: person.existingAccountUid, email: person.email });
    const authCount = fixture.auth;
    const orgId = await organizations.createOrganization({ name: 'Account Reuse Club', acronym: 'ARC', typeId: 'college', description: 'Test', adviser: person }, 'admin');
    const saved = fixture.store.get(`organizations/${orgId}`).adviser;
    assert.equal(fixture.auth, authCount); assert.equal(saved.authUid, person.existingAccountUid); assert.equal(saved.accountProvisioning, 'reused');
    assert.equal(saved.temporaryPassword, ''); assert.equal(saved.tempPass, null); assert.equal(saved.requiresPasswordChange, false); assert.equal(saved.existingAccountUid, undefined);
  });
  await test('A failed adviser write never rolls back or deletes the reused Auth account', async () => {
    fixture.authAccounts.set('safe@example.test', { exists: true, eligible: true, uid: 'existing-safe', email: 'safe@example.test' });
    const previous = fixture.store.get('organizations/guarded'); const authCount = fixture.auth; const rollbackCount = fixture.rollbacks.length;
    fixture.failWrites = true;
    try {
      await assert.rejects(() => organizations.assignOrRevokeOrganizationAdviser('guarded', 'Guarded Club', { action: 'assign', newAdviser: { firstName: 'Safe', lastName: 'Person', name: 'Safe Person', email: 'safe@example.test', existingAccountUid: 'existing-safe' }, sendEmailNotice: false }), /Fixture write failure/);
      assert.equal(fixture.auth, authCount); assert.equal(fixture.rollbacks.length, rollbackCount); assert.equal(fixture.store.get('organizations/guarded'), previous);
    } finally { fixture.failWrites = false; }
  });
  await test('Final validation rejects disabled accounts, changed UIDs and advisers already assigned to another club', async () => {
    fixture.authAccounts.set('disabled@example.test', { exists: true, eligible: false, uid: 'disabled', email: 'disabled@example.test', reason: 'This account is disabled.' });
    for (const candidate of [
      { name: 'Disabled User', email: 'disabled@example.test', existingAccountUid: 'disabled' },
      { name: 'Safe Person', email: 'safe@example.test', existingAccountUid: 'wrong-uid' },
      { name: 'Pat S. Rivera', email: 'pat@example.test', employeeId: 'FAC-PAT', existingAccountUid: 'existing-pat' },
    ]) await assert.rejects(() => organizations.assignOrRevokeOrganizationAdviser('guarded', 'Guarded Club', { action: 'assign', newAdviser: candidate, sendEmailNotice: false }), /disabled|no longer matches|already belongs to/);
  });
  const { toAccountRow } = await server.ssrLoadModule('/src/app/modules/accounts/services/account-directory.service.ts');
  await test('Student, adviser and signatory account labels use the same single initial', () => {
    assert.equal(toAccountRow('student', full).name, 'John S. Doe');
    assert.equal(toAccountRow('legacy', { firstName: 'John', lastName: 'Doe', middleInitial: 'S.' }).name, 'John S. Doe');
  });
  const { default: Management } = await server.ssrLoadModule('/src/app/admin/components/settings/InstitutionalSignatoryManagement.tsx');
  await test('Add Signatory accepts a full middle name and previews John S. Doe', async () => {
    await mount(Management); await click(button('Add Institutional Signatory'));
    const middle = host.querySelector('input[aria-label="Middle name"]'); assert.ok(middle); assert.equal(middle.hasAttribute('maxlength'), false);
    await type(inputByLabel('First Name'), 'John'); await type(inputByLabel('Last Name'), 'Doe'); await type(middle, 'Sigmund');
    assert.equal(middle.value, 'Sigmund'); assert.match(host.textContent, /Official Combined Name:John S\. Doe/);
  });
  await test('Edit Signatory restores the stored full middle name rather than its initial', async () => {
    await mount(Management); await click(host.querySelector('button[title="Edit Signatory Details"]'));
    assert.equal(host.querySelector('input[aria-label="Middle name"]').value, 'Sigmund');
  });
  const { default: SasMaintenance } = await server.ssrLoadModule('/src/app/admin/components/settings/SasSignatoryMaintenance.tsx');
  await test('SAS signatory form restores a full middle name and keeps it editable', async () => {
    await mount(SasMaintenance); const middle = host.querySelector('input[aria-label="Middle name"]'); assert.equal(middle.value, 'Sigmund');
    await type(middle, 'Samuel'); assert.equal(middle.value, 'Samuel'); assert.match(host.textContent, /John S\. Doe/);
  });
  const { EditOrganizationModal } = await server.ssrLoadModule('/src/app/admin/components/EditOrganizationModal.tsx');
  await test('Assign Adviser accepts Sigmund and previews the shortened signing name', async () => {
    await mount(EditOrganizationModal, { isOpen: true, organization: { id: 'empty-club', name: 'Empty Club', acronym: 'EC', description: 'Test', typeId: 'college', departmentId: 'cross-departmental' }, onClose() {} });
    await click(button('Assign Club Adviser')); const middle = host.querySelector('input[aria-label="Middle name"]'); assert.ok(middle); assert.equal(middle.hasAttribute('maxlength'), false);
    await type(inputByLabel('First Name'), 'John'); await type(inputByLabel('Last Name'), 'Doe'); await type(middle, 'Sigmund');
    assert.equal(middle.value, 'Sigmund'); assert.match(host.textContent, /John S\. Doe/);
  });
  await test('Adviser replacement requires verification, resets it after edits, and saves the review', async () => {
    await type(host.querySelector('input[type="email"]'), 'edit-form-namesake@example.test');
    await type(inputByLabel('Faculty / Employee ID'), 'EMP-EDIT-FORM');
    const checkbox = () => host.querySelector('input[aria-label="I verified this is a different person"]');
    assert.ok(checkbox()); assert.equal(checkbox().checked, false);
    const authCount = fixture.auth;
    await click(button('Save Changes')); assert.equal(fixture.auth, authCount);
    assert.match(host.textContent, /verify that this is a different person/);
    await click(checkbox()); assert.equal(checkbox().checked, true);
    await type(inputByLabel('Faculty / Employee ID'), 'EMP-EDIT-FORM-UPDATED');
    assert.equal(checkbox().checked, false, 'Changing the identity must require verification again');
    await click(checkbox()); await click(button('Save Changes'));
    assert.equal(fixture.auth, authCount + 1);
    assert.equal(fixture.store.get('organizations/empty-club').adviser.nameVerification.verifiedBy, 'John S. Doe');
  });
  await test('The adviser form shows a clear error when identity checks are unavailable', async () => {
    fixture.failReads.add('organization_advisers');
    try {
      await mount(EditOrganizationModal, { isOpen: true, organization: { id: 'unavailable', name: 'Unavailable Club', acronym: 'UC', typeId: 'college', departmentId: 'cross-departmental' }, onClose() {} });
      await click(button('Assign Club Adviser'));
      assert.match(host.querySelector('[role="alert"]').textContent, /Adviser identities could not be checked/);
    } finally { fixture.failReads.clear(); }
  });
  const { default: AddStudent } = await server.ssrLoadModule('/src/app/admin/components/student-registry/AddStudentManuallyModal.tsx');
  await test('Add Student continues to accept the complete optional middle name', async () => {
    await mount(AddStudent, { onClose() {}, onSuccess() {} });
    const middle = host.querySelector('input[aria-label="Middle name"]'); assert.equal(middle.required, false); assert.equal(middle.hasAttribute('maxlength'), false);
    await type(middle, 'Sigmund'); assert.equal(middle.value, 'SIGMUND');
  });
  const { default: CreateClub } = await server.ssrLoadModule('/src/app/modules/organizations/components/CreateClubModal.tsx');
  await test('The new-club adviser form also accepts a complete middle name and previews one initial', async () => {
    await mount(CreateClub, { isOpen: true, createdBy: 'admin', onClose() {} });
    await type(inputByLabel('Organization Name'), 'Student Logic Club');
    await type(host.querySelector('textarea'), 'Student programming activities.');
    const kind = [...host.querySelectorAll('select')].find((select) => select.querySelector('option[value="college"]'));
    assert.ok(kind); await flush(() => { kind.value = 'college'; kind.dispatchEvent(new Event('change', { bubbles: true })); });
    const file = host.querySelector('input[type="file"]'); const transfer = new DataTransfer(); transfer.items.add(new File(['logo'], 'club.png', { type: 'image/png' }));
    await flush(() => { file.files = transfer.files; file.dispatchEvent(new Event('change', { bubbles: true })); });
    await click(button('Next: Assign Adviser'));
    const middle = host.querySelector('input[aria-label="Middle name"]'); assert.ok(middle); assert.equal(middle.hasAttribute('maxlength'), false);
    await type(inputByLabel('First Name'), 'John'); await type(inputByLabel('Last Name'), 'Doe'); await type(middle, 'Sigmund');
    assert.equal(middle.value, 'Sigmund'); assert.match(host.textContent, /John S\. Doe/);
  });
  await test('New-club name warnings show matching accounts and require confirmation before review', async () => {
    await type(host.querySelector('input[type="email"]'), 'new-club-namesake@example.test');
    await type(inputByLabel('Faculty / Employee ID'), 'EMP-NEW-CLUB');
    assert.match(host.querySelector('[aria-label="Possible duplicate adviser"]').textContent, /club-adviser@example\.test/);
    assert.match(host.querySelector('[aria-label="Possible duplicate adviser"]').textContent, /John Sigmund Doe/);
    await click(button('Next: Review & Confirm'));
    assert.ok(button('Next: Review & Confirm'), 'An unverified name match must stay on the adviser step');
    assert.match(host.textContent, /verify that this is a different person/);
    const checkbox = host.querySelector('input[aria-label="I verified this is a different person"]');
    await click(checkbox); await click(button('Next: Review & Confirm'));
    assert.match(host.textContent, /Review & Confirm Organization/);
  });
  await test('Next blocks duplicate email and Faculty ID before organization creation and shows the existing person', async () => {
    await click(button('Back'));
    await type(host.querySelector('input[type="email"]'), 'CLUB-ADVISER@example.test');
    await type(inputByLabel('Faculty / Employee ID'), 'EMP-NAMESAKE');
    const authCount = fixture.auth; const orgCount = organizationRecords().length;
    await click(button('Next: Review & Confirm'));
    assert.ok(button('Next: Review & Confirm')); assert.equal(fixture.auth, authCount); assert.equal(organizationRecords().length, orgCount);
    assert.match(host.textContent, /This email already/); assert.match(host.textContent, /This Faculty \/ Employee ID already belongs to/);
    assert.match(host.textContent, /Already assigned to/);
  });
  await test('Next catches an Auth-only email and offers Use this person', async () => {
    fixture.authAccounts.set('existing-only@example.test', { exists: true, eligible: true, uid: 'existing-only', email: 'existing-only@example.test', displayName: 'Taylor Morgan' });
    await type(inputByLabel('First Name'), 'Taylor'); await type(inputByLabel('Last Name'), 'Morgan'); await type(host.querySelector('input[aria-label="Middle name"]'), '');
    await type(host.querySelector('input[type="email"]'), 'existing-only@example.test'); await type(inputByLabel('Faculty / Employee ID'), 'FAC-TAYLOR');
    await click(button('Next: Review & Confirm'));
    assert.ok(button('Next: Review & Confirm')); assert.match(host.textContent, /This email already has an account/); assert.ok(button('Use this person'));
  });
  await test('Use this person keeps their current password, and editing identity requires selection again', async () => {
    await click(button('Use this person'));
    assert.match(host.textContent, /Their current password stays the same/); assert.match(host.textContent, /Use existing password/);
    await click(button('Next: Review & Confirm')); assert.match(host.textContent, /Review & Confirm Organization/);
    await click(button('Back')); await type(inputByLabel('Faculty / Employee ID'), 'FAC-TAYLOR-UPDATED');
    assert.doesNotMatch(host.textContent, /Their current password stays the same/);
    await click(button('Next: Review & Confirm')); assert.ok(button('Next: Review & Confirm'));
    await click(button('Use this person')); fixture.authAccounts.delete('existing-only@example.test');
    await click(button('Next: Review & Confirm')); assert.ok(button('Next: Review & Confirm')); assert.match(host.textContent, /selected account no longer exists/);
  });
  await test('Fresh read or account-check failures keep Next on the adviser step without any writes', async () => {
    await type(inputByLabel('First Name'), 'Unique'); await type(inputByLabel('Last Name'), 'Faculty'); await type(host.querySelector('input[type="email"]'), 'unique-faculty@example.test');
    const authCount = fixture.auth; const orgCount = organizationRecords().length;
    fixture.failReads.add('institutional_signatories');
    await click(button('Next: Review & Confirm')); assert.ok(button('Next: Review & Confirm')); assert.match(host.textContent, /Fixture read failure/);
    fixture.failReads.clear(); fixture.failAccountCheck = true;
    await click(button('Next: Review & Confirm')); assert.ok(button('Next: Review & Confirm')); assert.match(host.textContent, /Fixture account check unavailable/);
    fixture.failAccountCheck = false; assert.equal(fixture.auth, authCount); assert.equal(organizationRecords().length, orgCount);
    await click(button('Next: Review & Confirm')); assert.match(host.textContent, /Review & Confirm Organization/);
  });
  assert.deepEqual(errors, [], 'No form rendering/import/runtime errors');
  console.log(`\n${passed} name formatting, persistence and form checks passed. All writes/credential messages used local fixtures.`);
} finally {
  if (root) await flush(() => root.unmount());
  console.error = originalError; URL.createObjectURL = originalCreateObjectURL; URL.revokeObjectURL = originalRevokeObjectURL;
  await server.close(); browser.happyDOM.abort(); delete globalThis.nameTestFixture; delete globalThis.nameTestSDK;
}
process.exit(0);
