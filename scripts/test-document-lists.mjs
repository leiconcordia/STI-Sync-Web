import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createServer } from 'vite';

const browser = new Window({ url: 'http://localhost/' });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'HTMLSelectElement', 'HTMLTextAreaElement', 'Element', 'Node', 'NodeFilter', 'MutationObserver', 'CustomEvent', 'Event', 'KeyboardEvent', 'MouseEvent', 'DocumentFragment', 'HTMLFormElement', 'HTMLButtonElement', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'ResizeObserver']) {
  const value = browser[key];
  if (value !== undefined) Object.defineProperty(globalThis, key, { configurable: true, value: typeof value === 'function' && ['getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame'].includes(key) ? value.bind(browser) : value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = await import('react');
const { act } = React;
const { createRoot } = await import('react-dom/client');
const { Timestamp } = await import('firebase/firestore');
const createdAt = Timestamp.fromDate(new Date('2026-11-01T08:00:00Z'));
const organization = { id: 'alpha', name: 'Alpha Club', acronym: 'ALPHA', typeId: 'college', status: 'active' };
const original = {
  id: 'previously-stored-document', type: 'submission', documentKind: 'general',
  title: 'Previously Stored Waiver', referenceNumber: 'DOC-2025-0042',
  categoryId: 'waivers', category: 'Original Waiver Label',
  submittedByOrgId: 'alpha', submittedByOrgName: 'Alpha Club', submittedByOrgAcronym: 'ALPHA', submittedByOrgTypeId: 'college',
  submittedBy: 'Alpha Officer', submittedByEmail: 'alpha@example.test',
  status: 'Approved', visibility: 'owner_and_sas', isSasInternal: false,
  fileUrl: 'https://res.cloudinary.com/example/previously-stored-waiver.pdf', fileName: 'previously-stored-waiver.pdf', fileType: 'PDF', fileSize: 1024,
  academicYear: '2025-2026', semester: '1st Semester', semesterId: '', createdAt, updatedAt: createdAt,
  broadcastBy: 'SAS Administrator', distribution: 'all', targetOrgIds: ['alpha'], readBy: {},
};
globalThis.documentListFixture = {
  documents: [original], broadcasts: [{ ...original, id: 'previously-sent-document', type: 'broadcast', title: 'Previously Sent Guidelines', referenceNumber: 'SAS-2025-0009' }],
  categories: [{ id: 'waivers', name: 'Renamed Waivers', active: true, archived: false, sortOrder: 0, color: 'bg-blue-100 text-blue-700' }], organization,
  downloads: [],
};
const fixtures = `
  const state = globalThis.documentListFixture;
  const result = (data) => ({ data, loading: false, error: null });
  export const useDocumentCategories = () => result(state.categories);
  export const useIncomingDocuments = () => result(state.documents);
  export const useSentDocuments = () => result(state.broadcasts);
  export const useOfficerSubmissions = () => result(state.documents);
  export const useOfficerInbox = () => result(state.broadcasts);
  export const useEdmsDocuments = () => result(state.documents);
  export const useOrganizationStream = () => result([state.organization]);
  export const useAdviserProfile = () => ({ profile: { uid: 'sas', displayName: 'SAS Administrator' } });
  export const useOfficerProfile = () => ({ profile: { activeOrganizationId: 'alpha', studentName: 'Alpha Officer', email: 'alpha@example.test' } });
  export const useSemesters = () => result([]);
  export const useActiveAcademicPeriods = () => ({ periods: [], activeCollegePeriod: null, activeShsPeriod: null });
  export const downloadDocument = async (record) => { state.downloads.push(record); };
  export const documentFileUrl = async () => '';
  export const edmsRequest = async () => ({});
  export const ensureEdmsAccess = async () => ({ isAdmin: true, orgIds: ['alpha'] });
  export const createDocument = async () => { throw new Error('This read-only regression must not create documents'); };
  export const reviewDocument = async () => { throw new Error('This read-only regression must not review documents'); };
  export const getNextReferenceNumber = async () => { throw new Error('This read-only regression must not allocate references'); };
  export const markDocumentRead = async () => {};
  export const db = {}; export const auth = {}; export const functions = {}; export const storage = {};
`;
const mocked = ['/hooks/useDocumentCategories', '/hooks/useDocumentStream', '/hooks/useOrganizationStream', '/hooks/useAdviserProfile', '/hooks/useOfficerProfile', '/hooks/useAcademicStream', '/services/edms-api.service', '/services/document.service', '/services/firebase'];
const server = await createServer({
  server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, entries: [] }, appType: 'custom',
  plugins: [{ name: 'document-list-fixtures', enforce: 'pre', resolveId(source) {
    const path = source.replaceAll('\\', '/').replace(/\.(tsx?|mjs)$/, '');
    if (mocked.some((suffix) => path.endsWith(suffix))) return '\0document-list-fixtures';
  }, load(id) { if (id === '\0document-list-fixtures') return fixtures; } }],
});

try {
  const { MemoryRouter } = await server.ssrLoadModule('react-router');
  const { AdminDocuments } = await server.ssrLoadModule('/src/app/admin/pages/AdminDocuments.tsx');
  const { default: OfficerDocuments } = await server.ssrLoadModule('/src/app/officer/pages/OfficerDocuments.tsx');
  for (const [name, Component, path, title, recordId] of [
    ['SAS Inbox', AdminDocuments, '/home/documents?view=incoming', original.title, original.id],
    ['SAS Sent', AdminDocuments, '/home/documents?view=sent', 'Previously Sent Guidelines', 'previously-sent-document'],
    ['Officer My Submissions', OfficerDocuments, '/officer/documents?view=submissions', original.title, original.id],
    ['Officer From SAS', OfficerDocuments, '/officer/documents?view=inbox', 'Previously Sent Guidelines', 'previously-sent-document'],
    ['SAS stored category', AdminDocuments, '/home/documents?view=storage&storage=category:waivers', original.title, original.id],
    ['Officer stored category', OfficerDocuments, '/officer/documents?view=storage&storage=category:waivers', original.title, original.id],
  ]) {
    const host = document.createElement('div'); document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () => root.render(React.createElement(MemoryRouter, { initialEntries: [path] }, React.createElement(Component))));
      assert.ok(host.textContent.includes(title), `${name} must show previously stored records`);
      assert.ok(host.textContent.includes('Renamed Waivers'), `${name} must render a category label rather than an object`);
      assert.ok(!host.textContent.includes('[object Object]'), `${name} must not stringify category objects`);
      if (!path.includes('view=storage')) {
        const option = [...host.querySelectorAll('option')].find((item) => item.textContent === 'Renamed Waivers');
        assert.equal(option?.value, 'waivers', `${name} must retain the category ID as the filter value`);
        await act(async () => { option.parentElement.value = 'waivers'; option.parentElement.dispatchEvent(new Event('change', { bubbles: true })); });
        assert.ok(host.textContent.includes(title), `${name} must still show the existing document after selecting its renamed category`);
      }
      const button = [...host.querySelectorAll('button')].find((item) => /^Download/.test(item.getAttribute('title') || '') || /^Download/.test(item.getAttribute('aria-label') || ''));
      assert.ok(button && !button.disabled, `${name} must provide a download for the stored file`);
      await act(async () => button.click());
      const downloaded = globalThis.documentListFixture.downloads.at(-1);
      assert.equal(downloaded.id, recordId, `${name} must download the existing record rather than a different row`);
      assert.equal(downloaded.fileUrl, original.fileUrl, `${name} must preserve the existing stored URL`);
      console.log(`PASS: ${name} renders saved records, category labels/IDs and the existing download action`);
    } finally { await act(async () => root.unmount()); host.remove(); }
  }
} finally {
  await server.close(); browser.happyDOM.abort(); delete globalThis.documentListFixture;
}
process.exit(0);
