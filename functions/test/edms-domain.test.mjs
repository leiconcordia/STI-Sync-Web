import { test } from 'node:test';
import assert from 'node:assert/strict';
import { documentKind, storageTabs, reportStorageTabs, storageKey, ownsDocument, normalizeCategoryName, sourceOwner, sourceIsApproved, categoryFilterOptions, matchesDocumentCategory } from '../edms-domain.mjs';

test('custom category labels cannot classify AP, PAR, or FL', () => {
  for (const category of ['Activity Proposal', 'Post-Activity Report', 'Financial Liquidation']) {
    assert.equal(documentKind({ type: 'submission', category, categoryId: 'custom' }), 'general');
    assert.equal(storageKey({ type: 'submission', category, categoryId: 'custom' }), 'category:custom');
  }
});
test('Reports & Analytics storage is independent of every EDMS category', () => {
  for (const documentKind of ['activity_proposal', 'post_activity_report', 'financial_liquidation']) assert.equal(storageKey({ documentKind, categoryId: 'waivers' }), documentKind);
});
test('custom tabs retain historical categories and count only approved documents', () => {
  const docs = [
    { id: 'a', type: 'submission', status: 'Approved', documentKind: 'general', categoryId: 'old', category: 'Old Name' },
    { id: 'b', type: 'submission', status: 'Pending', categoryId: 'current' },
    { id: 'c', type: 'submission', status: 'Approved', documentKind: 'activity_proposal', categoryId: 'current' },
  ];
  const tabs = storageTabs([{ id: 'current', name: 'Waivers', active: true }, { id: 'old', name: 'Renamed', active: false, archived: true }], docs);
  assert.equal(tabs.find((tab) => tab.key === 'category:old').label, 'Renamed');
  assert.equal(tabs.find((tab) => tab.key === 'category:old').count, 1);
  assert.equal(tabs.find((tab) => tab.key === 'category:current').count, 0);
  assert.equal(tabs.some((tab) => tab.key === 'activity_proposal'), false);
  assert.equal(reportStorageTabs(docs).find((tab) => tab.key === 'activity_proposal').count, 1);
});
test('organization ownership fails closed for missing, internal, other-org and broadcast records', () => {
  const doc = { type: 'submission', submittedByOrgId: 'org-a', visibility: 'owner_and_sas' };
  assert.equal(ownsDocument(doc, 'org-a'), true);
  for (const orgId of ['', null, undefined, 'org-b', 'sas']) assert.equal(ownsDocument(doc, orgId), false);
  assert.equal(ownsDocument({ ...doc, visibility: 'sas_only' }, 'org-a'), false);
  assert.equal(ownsDocument({ ...doc, isSasInternal: true }, 'org-a'), false);
  assert.equal(ownsDocument({ ...doc, type: 'broadcast' }, 'org-a'), false);
});
test('legacy PAR archives remain distinct from proposal archives', () => {
  assert.equal(documentKind({ sourceModule: 'events', sourceRecordId: 'par', title: '[Approved PAR] Activity' }), 'post_activity_report');
  assert.equal(documentKind({ sourceModule: 'events', sourceRecordId: 'ap', title: '[Approved Proposal] Activity' }), 'activity_proposal');
});
test('category names normalize whitespace, Unicode and case without losing display capitalization', () => {
  assert.deepEqual(normalizeCategoryName('  Club   Ｗaivers  '), { name: 'Club Waivers', normalizedName: 'club waivers' });
  assert.throws(() => normalizeCategoryName('   ')); assert.throws(() => normalizeCategoryName('x'.repeat(101)));
});
test('category filters continue to match by ID after renaming', () => {
  const record = { categoryId: 'stable-id', category: 'Original label' };
  const options = categoryFilterOptions([{ id: 'stable-id', name: 'Renamed label', active: true }], [record]);
  assert.equal(options.find((item) => item.value === 'stable-id').label, 'Renamed label');
  assert.equal(matchesDocumentCategory(record, 'stable-id'), true);
  assert.equal(matchesDocumentCategory(record, 'Renamed label'), false);
  assert.equal(matchesDocumentCategory({}, 'uncategorized'), true);
});
test('source ownership never invents an organization or exposes an internal document', () => {
  assert.throws(() => sourceOwner('post_activity_report', {}));
  assert.deepEqual(sourceOwner('activity_proposal', { hostingOrgId: 'org-a', isOfficerProposal: true }), { orgId: 'org-a', internal: false });
  assert.deepEqual(sourceOwner('financial_liquidation', { organizationId: 'org-a', createdByRole: 'admin' }), { orgId: 'org-a', internal: false });
  assert.deepEqual(sourceOwner('financial_liquidation', { organizationId: 'org-a', isSasInternal: true }), { orgId: 'sas', internal: true });
  assert.equal(sourceIsApproved('post_activity_report', { status: 'under_review' }), false);
  assert.equal(sourceIsApproved('post_activity_report', { status: 'approved', isDeleted: true }), false);
});
