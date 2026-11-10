export const WORKFLOW_KINDS = ['activity_proposal', 'post_activity_report', 'financial_liquidation'];
export const WORKFLOW_LABELS = { activity_proposal: 'Activity Proposals', post_activity_report: 'Post-Activity Reports', financial_liquidation: 'Financial Liquidations' };

// Category names are deliberately never used to classify a workflow archive.
export function documentKind(record = {}) {
  if (WORKFLOW_KINDS.includes(record.documentKind)) return record.documentKind;
  if (record.documentKind === 'general' || record.type === 'broadcast') return 'general';
  if (!record.isSystemGenerated && !record.sourceRecordId) return 'general';
  if (record.sourceCollection === 'post_activity_reports') return 'post_activity_report';
  if (record.sourceCollection === 'liquidations' || record.sourceModule === 'finance') return 'financial_liquidation';
  if (/^\[Approved PAR\]/i.test(record.title || '') || /^PAR-/i.test(record.fileName || '')) return 'post_activity_report';
  if (record.sourceModule === 'events') return 'activity_proposal';
  return 'general';
}

export function ownsDocument(record, orgId) {
  return Boolean(orgId && orgId !== 'sas' && record.type === 'submission' && record.submittedByOrgId === orgId && !record.isSasInternal && record.visibility !== 'sas_only');
}

export function isStoredDocument(record) {
  return record.type === 'submission' && record.status === 'Approved';
}

export function storageKey(record) {
  const kind = documentKind(record);
  return WORKFLOW_KINDS.includes(kind) ? kind : record.categoryId ? `category:${record.categoryId}` : 'uncategorized';
}

export function storageTabs(categories, documents) {
  const stored = documents.filter(isStoredDocument);
  const custom = documents.filter((record) => documentKind(record) === 'general');
  const names = new Map(categories.filter((category) => category.active && !category.archived).map((category) => [category.id, category.name]));
  for (const record of custom) if (record.categoryId && !names.has(record.categoryId)) names.set(record.categoryId, categories.find((category) => category.id === record.categoryId)?.name || record.category || 'Unavailable category');
  const tabs = [];
  for (const [id, label] of names) tabs.push({ key: `category:${id}`, label });
  tabs.push({ key: 'uncategorized', label: 'Uncategorized' });
  return tabs.map((tab) => ({ ...tab, count: stored.filter((record) => storageKey(record) === tab.key).length }));
}

export function reportStorageTabs(documents) {
  return WORKFLOW_KINDS.map((key) => ({ key, label: WORKFLOW_LABELS[key], count: documents.filter((record) => isStoredDocument(record) && documentKind(record) === key).length }));
}

export function categoryFilterOptions(categories, documents) {
  const options = new Map(categories.filter((item) => item.active && !item.archived).map((item) => [item.id, item.name]));
  for (const record of documents) {
    if (record.categoryId && !options.has(record.categoryId)) options.set(record.categoryId, categories.find((item) => item.id === record.categoryId)?.name || record.category || 'Unavailable category');
  }
  return [...options].map(([value, label]) => ({ value, label })).concat([{ value: 'uncategorized', label: 'Uncategorized' }]);
}
export function matchesDocumentCategory(record, filter) {
  return filter === 'All' || (filter === 'uncategorized' ? !record.categoryId : record.categoryId === filter);
}

export function normalizeCategoryName(value) {
  const name = String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (!name || name.length > 100) throw new Error('Enter a category name between 1 and 100 characters.');
  return { name, normalizedName: name.toLocaleLowerCase('en-US') };
}

export function sourceIsApproved(kind, source) {
  if (!source || source.isDeleted || source.deletedAt || source.isTrashed) return false;
  return kind === 'activity_proposal' ? source.proposalStatus === 'approved' || source.isApproved === true : source.status === 'approved';
}

export function sourceOwner(kind, source) {
  const id = kind === 'activity_proposal' ? source.hostingOrgId || source.organizationId : source.organizationId;
  const internal = source.isSasInternal === true || source.visibility === 'sas_only' || source.isOfficerProposal === false || id === 'sas' || (!id && ['admin', 'sas_admin', 'sao_admin'].includes(source.createdByRole || source.creatorRole));
  if (!id && !internal) throw new Error('The approved document has no owning organization. Repair the source before storing it.');
  return { orgId: internal ? 'sas' : id, internal };
}

export function sourceVersion(source) {
  return Math.max(1, Number(source.revisionCount || source.version || source.revisionNumber || 1) || 1);
}

export const CATEGORY_COLORS = [
  { color: 'bg-blue-100 text-blue-700', colorDot: 'bg-blue-600' },
  { color: 'bg-green-100 text-green-700', colorDot: 'bg-green-600' },
  { color: 'bg-purple-100 text-purple-700', colorDot: 'bg-purple-600' },
  { color: 'bg-amber-100 text-amber-700', colorDot: 'bg-amber-500' },
  { color: 'bg-indigo-50 text-indigo-700', colorDot: 'bg-indigo-600' },
  { color: 'bg-gray-100 text-gray-700', colorDot: 'bg-gray-500' },
];
