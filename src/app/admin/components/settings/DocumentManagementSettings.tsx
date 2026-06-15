import { useState } from 'react';
import {
  Files, Plus, Trash2, GripVertical, Edit2, Check, X,
  AlertCircle, Tag, Upload, Clock, Bell, Archive,
  Hash, Shield, RefreshCw,
} from 'lucide-react';

interface DocumentManagementSettingsProps {
  onUnsavedChange: () => void;
}

// ─── Types ─────────────────────────────────────────────────────────────────────
interface DocCategory {
  id: string;
  name: string;
  color: string;
  requiresRemarks: boolean;
  officerCanSubmit: boolean;
  active: boolean;
}

interface FileRule {
  format: string;
  enabled: boolean;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
const COLOR_OPTIONS = [
  { label: 'Violet', value: 'bg-[#F3E8FF] text-[#83358E]', dot: 'bg-[#83358E]' },
  { label: 'Blue', value: 'bg-blue-100 text-blue-700', dot: 'bg-blue-600' },
  { label: 'Amber', value: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  { label: 'Green', value: 'bg-green-100 text-green-700', dot: 'bg-green-600' },
  { label: 'Navy', value: 'bg-[#001A4D]/10 text-[#001A4D]', dot: 'bg-[#001A4D]' },
  { label: 'Teal', value: 'bg-teal-100 text-teal-700', dot: 'bg-teal-600' },
  { label: 'Gray', value: 'bg-gray-100 text-gray-600', dot: 'bg-gray-500' },
  { label: 'Red', value: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
];

function Toggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${value ? 'bg-[#83358E]' : 'bg-gray-300'}`}
    >
      <div
        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow ${value ? 'translate-x-6' : ''}`}
      />
    </button>
  );
}

// ─── Category Row ──────────────────────────────────────────────────────────────
function CategoryRow({
  cat,
  onUpdate,
  onDelete,
  onChange,
}: {
  cat: DocCategory;
  onUpdate: (c: DocCategory) => void;
  onDelete: () => void;
  onChange: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(cat.name);
  const [colorPicker, setColorPicker] = useState(false);

  const currentColor = COLOR_OPTIONS.find((c) => c.value === cat.color) || COLOR_OPTIONS[0];

  const save = () => {
    if (!draft.trim()) return;
    onUpdate({ ...cat, name: draft.trim() });
    onChange();
    setEditing(false);
  };

  return (
    <div className={`flex items-center gap-3 p-3 border rounded-xl transition-colors ${cat.active ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-60'}`}>
      <GripVertical className="w-4 h-4 text-gray-300 cursor-grab flex-shrink-0" />

      {/* Color dot / picker trigger */}
      <div className="relative flex-shrink-0">
        <button
          onClick={() => { setColorPicker(!colorPicker); onChange(); }}
          className={`w-4 h-4 rounded-full ${currentColor.dot} ring-2 ring-white ring-offset-1`}
        />
        {colorPicker && (
          <div className="absolute left-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-xl shadow-lg p-2 flex flex-wrap gap-1 w-44">
            {COLOR_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => { onUpdate({ ...cat, color: opt.value }); onChange(); setColorPicker(false); }}
                className={`w-5 h-5 rounded-full ${opt.dot} hover:scale-110 transition-transform ${cat.color === opt.value ? 'ring-2 ring-offset-1 ring-[#83358E]' : ''}`}
                title={opt.label}
              />
            ))}
          </div>
        )}
      </div>

      {/* Name */}
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
          className="flex-1 px-2 py-1 border border-[#83358E] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#83358E]"
        />
      ) : (
        <span className={`flex-1 text-sm font-medium inline-flex items-center`}>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cat.color}`}>{cat.name}</span>
        </span>
      )}

      {/* Toggles */}
      <div className="flex items-center gap-4 flex-shrink-0 text-xs text-gray-500">
        <label className="flex items-center gap-1.5 cursor-pointer" title="Officer can submit this category">
          <input
            type="checkbox"
            checked={cat.officerCanSubmit}
            onChange={(e) => { onUpdate({ ...cat, officerCanSubmit: e.target.checked }); onChange(); }}
            className="accent-[#83358E] w-3.5 h-3.5"
          />
          <span className="hidden xl:inline">Officers</span>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer" title="Rejection requires remarks">
          <input
            type="checkbox"
            checked={cat.requiresRemarks}
            onChange={(e) => { onUpdate({ ...cat, requiresRemarks: e.target.checked }); onChange(); }}
            className="accent-[#83358E] w-3.5 h-3.5"
          />
          <span className="hidden xl:inline">Req. remarks</span>
        </label>
      </div>

      {/* Active toggle */}
      <Toggle value={cat.active} onChange={(v) => { onUpdate({ ...cat, active: v }); onChange(); }} />

      {/* Actions */}
      <div className="flex gap-1 flex-shrink-0">
        {editing ? (
          <>
            <button onClick={save} className="w-7 h-7 flex items-center justify-center rounded-lg bg-green-50 text-green-600 hover:bg-green-100 transition-colors"><Check className="w-3.5 h-3.5" /></button>
            <button onClick={() => setEditing(false)} className="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-50 text-gray-500 hover:bg-gray-100 transition-colors"><X className="w-3.5 h-3.5" /></button>
          </>
        ) : (
          <>
            <button onClick={() => { setDraft(cat.name); setEditing(true); }} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"><Edit2 className="w-3.5 h-3.5" /></button>
            <button onClick={onDelete} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main Settings Component ───────────────────────────────────────────────────
export default function DocumentManagementSettings({ onUnsavedChange }: DocumentManagementSettingsProps) {
  // ── Document Categories ──────────────────────────────────────────────────────
  const [categories, setCategories] = useState<DocCategory[]>([
    { id: '1', name: 'Activity Letter', color: 'bg-[#F3E8FF] text-[#83358E]', requiresRemarks: true, officerCanSubmit: true, active: true },
    { id: '2', name: 'Accreditation Paper', color: 'bg-blue-100 text-blue-700', requiresRemarks: true, officerCanSubmit: true, active: true },
    { id: '3', name: 'Waiver / Permission Slip', color: 'bg-amber-100 text-amber-700', requiresRemarks: true, officerCanSubmit: true, active: true },
    { id: '4', name: 'Financial Report', color: 'bg-green-100 text-green-700', requiresRemarks: false, officerCanSubmit: true, active: true },
    { id: '5', name: 'Event Proposal', color: 'bg-[#001A4D]/10 text-[#001A4D]', requiresRemarks: true, officerCanSubmit: true, active: true },
    { id: '6', name: 'Certificate Request', color: 'bg-teal-100 text-teal-700', requiresRemarks: false, officerCanSubmit: true, active: true },
    { id: '7', name: 'Memorandum / Official Letter', color: 'bg-gray-100 text-gray-600', requiresRemarks: false, officerCanSubmit: false, active: true },
    { id: '8', name: 'Other', color: 'bg-gray-100 text-gray-600', requiresRemarks: false, officerCanSubmit: true, active: true },
  ]);
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState(COLOR_OPTIONS[0].value);
  const [addingCat, setAddingCat] = useState(false);

  const addCategory = () => {
    if (!newCatName.trim()) return;
    setCategories([...categories, {
      id: Date.now().toString(),
      name: newCatName.trim(),
      color: newCatColor,
      requiresRemarks: false,
      officerCanSubmit: true,
      active: true,
    }]);
    setNewCatName('');
    setAddingCat(false);
    onUnsavedChange();
  };

  // ── File Upload Rules ────────────────────────────────────────────────────────
  const [fileRules, setFileRules] = useState<FileRule[]>([
    { format: 'PDF', enabled: true },
    { format: 'DOCX', enabled: true },
    { format: 'DOC', enabled: true },
    { format: 'XLSX', enabled: false },
    { format: 'JPG', enabled: false },
    { format: 'PNG', enabled: false },
  ]);
  const [maxFileSizeMB, setMaxFileSizeMB] = useState(25);
  const [maxFileSizeBroadcastMB, setMaxFileSizeBroadcastMB] = useState(50);
  const [allowMultipleFiles, setAllowMultipleFiles] = useState(false);
  const [maxFilesPerSubmission, setMaxFilesPerSubmission] = useState(1);

  // ── Reference Number ─────────────────────────────────────────────────────────
  const [refPrefix, setRefPrefix] = useState('DOC');
  const [refSeparator, setRefSeparator] = useState('-');
  const [refIncludeYear, setRefIncludeYear] = useState(true);
  const [refPadding, setRefPadding] = useState(4);
  const refPreview = `${refPrefix}${refSeparator}${refIncludeYear ? '2026' + refSeparator : ''}${'0'.repeat(Math.max(0, refPadding - 1))}1`;

  // ── Review Workflow ──────────────────────────────────────────────────────────
  const [slaHours, setSlaHours] = useState(48);
  const [slaWarningHours, setSlaWarningHours] = useState(24);
  const [requireRemarksOnReject, setRequireRemarksOnReject] = useState(true);
  const [minRejectRemarkChars, setMinRejectRemarkChars] = useState(10);
  const [allowResubmission, setAllowResubmission] = useState(true);
  const [maxResubmissions, setMaxResubmissions] = useState(3);
  const [allowQuickApprove, setAllowQuickApprove] = useState(true);
  const [infoRequestedStatus, setInfoRequestedStatus] = useState(true);

  // ── Broadcast Settings ───────────────────────────────────────────────────────
  const [broadcastCategories, setBroadcastCategories] = useState([
    { id: 'b1', name: 'Memo', active: true },
    { id: 'b2', name: 'Policy', active: true },
    { id: 'b3', name: 'Guidelines', active: true },
    { id: 'b4', name: 'Approved Template', active: true },
    { id: 'b5', name: 'Signed Approval Form', active: true },
    { id: 'b6', name: 'Announcement', active: true },
    { id: 'b7', name: 'Reminder', active: false },
    { id: 'b8', name: 'Report', active: false },
  ]);
  const [defaultPushNotif, setDefaultPushNotif] = useState(true);
  const [defaultInAppNotif, setDefaultInAppNotif] = useState(true);
  const [defaultEmailNotif, setDefaultEmailNotif] = useState(false);

  // ── Retention & Archive ──────────────────────────────────────────────────────
  const [retentionYears, setRetentionYears] = useState(5);
  const [autoArchiveCompleted, setAutoArchiveCompleted] = useState(true);
  const [archiveAfterSemesters, setArchiveAfterSemesters] = useState(2);
  const [allowOfficerDelete, setAllowOfficerDelete] = useState(false);
  const [draftExpiryDays, setDraftExpiryDays] = useState(30);

  // ── Notifications ────────────────────────────────────────────────────────────
  const [notifyOnSubmit, setNotifyOnSubmit] = useState(true);
  const [notifyOnDecision, setNotifyOnDecision] = useState(true);
  const [notifyOnOverdue, setNotifyOnOverdue] = useState(true);
  const [overdueReminderHours, setOverdueReminderHours] = useState(24);

  const ch = () => onUnsavedChange();

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-[#001A4D]">Document Management Settings</h2>
        <p className="text-sm text-gray-500 mt-1">Configure the Electronic Document Management System (EDMS) — categories, upload rules, review workflow, and notifications.</p>
      </div>

      {/* ── 1. Document Categories ─────────────────────────────────────────── */}
      <div className="bg-white border border-[#E0E0E0] rounded-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="border-l-4 border-[#83358E] pl-3">
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-[#83358E]" />
              <h3 className="text-base font-bold text-[#001A4D]">Document Categories</h3>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">Manage the categories officers can select when submitting documents.</p>
          </div>
          <button
            onClick={() => setAddingCat(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#001A4D] text-[#FFD41C] text-sm font-medium rounded-lg hover:bg-[#001A4D]/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Category
          </button>
        </div>

        {/* Column headers */}
        <div className="flex items-center gap-3 px-3 mb-2 text-xs font-bold text-gray-400 uppercase tracking-wide">
          <div className="w-4 flex-shrink-0" />
          <div className="w-4 flex-shrink-0" />
          <div className="flex-1">Category Name</div>
          <div className="flex items-center gap-4 flex-shrink-0 mr-14">
            <span title="Officers can submit this category" className="hidden xl:inline">Officers</span>
            <span title="Rejection requires remarks" className="hidden xl:inline">Req. remarks</span>
            <span>Active</span>
          </div>
        </div>

        <div className="space-y-2">
          {categories.map((cat) => (
            <CategoryRow
              key={cat.id}
              cat={cat}
              onUpdate={(updated) => setCategories(categories.map((c) => (c.id === updated.id ? updated : c)))}
              onDelete={() => { setCategories(categories.filter((c) => c.id !== cat.id)); ch(); }}
              onChange={ch}
            />
          ))}
        </div>

        {/* Add new category inline */}
        {addingCat && (
          <div className="flex items-center gap-3 mt-3 p-3 border-2 border-dashed border-[#83358E]/40 rounded-xl bg-[#F3E8FF]/30">
            <div className="flex gap-1 flex-shrink-0">
              {COLOR_OPTIONS.slice(0, 4).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setNewCatColor(opt.value)}
                  className={`w-5 h-5 rounded-full ${opt.dot} hover:scale-110 transition-transform ${newCatColor === opt.value ? 'ring-2 ring-offset-1 ring-[#83358E]' : ''}`}
                />
              ))}
            </div>
            <input
              autoFocus
              type="text"
              placeholder="New category name..."
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addCategory(); if (e.key === 'Escape') setAddingCat(false); }}
              className="flex-1 px-3 py-2 border border-[#83358E] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#83358E]"
            />
            <button onClick={addCategory} className="px-3 py-2 bg-[#83358E] text-white rounded-lg text-sm font-medium hover:bg-[#6D2A78] transition-colors">Add</button>
            <button onClick={() => setAddingCat(false)} className="px-3 py-2 text-gray-500 hover:text-gray-700 transition-colors text-sm">Cancel</button>
          </div>
        )}

        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-gray-700"><strong>Officers</strong> — category is visible in the officer submission form. <strong>Req. remarks</strong> — SAS must provide remarks when rejecting a document of this type. Drag rows to reorder.</p>
        </div>
      </div>

      {/* ── 2. File Upload Rules ───────────────────────────────────────────── */}
      <div className="bg-white border border-[#E0E0E0] rounded-xl p-6">
        <div className="border-l-4 border-[#83358E] pl-3 mb-5">
          <div className="flex items-center gap-2">
            <Upload className="w-4 h-4 text-[#83358E]" />
            <h3 className="text-base font-bold text-[#001A4D]">File Upload Rules</h3>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">Control accepted formats and size limits for officer submissions and SAS broadcasts.</p>
        </div>

        <div className="space-y-5">
          {/* Accepted formats */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Accepted File Formats</label>
            <div className="grid grid-cols-3 gap-2">
              {fileRules.map((rule, i) => (
                <label key={rule.format} className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-colors ${rule.enabled ? 'border-[#83358E]/40 bg-[#F3E8FF]/30' : 'border-gray-200'}`}>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={(e) => {
                        const updated = [...fileRules];
                        updated[i] = { ...rule, enabled: e.target.checked };
                        setFileRules(updated);
                        ch();
                      }}
                      className="accent-[#83358E]"
                    />
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${rule.format === 'PDF' ? 'bg-red-100 text-red-700' : rule.format === 'DOCX' || rule.format === 'DOC' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>{rule.format}</span>
                  </div>
                  <span className={`text-xs ${rule.enabled ? 'text-[#83358E] font-medium' : 'text-gray-400'}`}>{rule.enabled ? 'Allowed' : 'Blocked'}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Max File Size — Officer Submissions (MB)</label>
              <input
                type="number"
                min={1}
                max={100}
                value={maxFileSizeMB}
                onChange={(e) => { setMaxFileSizeMB(+e.target.value); ch(); }}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">Per file uploaded by officers</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Max File Size — SAS Broadcasts (MB)</label>
              <input
                type="number"
                min={1}
                max={200}
                value={maxFileSizeBroadcastMB}
                onChange={(e) => { setMaxFileSizeBroadcastMB(+e.target.value); ch(); }}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">Per file broadcast by SAS Admin</p>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
            <div>
              <p className="text-sm font-medium text-gray-900">Allow Multiple Files per Submission</p>
              <p className="text-xs text-gray-500">Officers can attach more than one file to a single document submission.</p>
            </div>
            <Toggle value={allowMultipleFiles} onChange={(v) => { setAllowMultipleFiles(v); ch(); }} />
          </div>

          {allowMultipleFiles && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Maximum Files per Submission</label>
              <input
                type="number"
                min={2}
                max={10}
                value={maxFilesPerSubmission}
                onChange={(e) => { setMaxFilesPerSubmission(+e.target.value); ch(); }}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent"
              />
            </div>
          )}
        </div>
      </div>

      {/* ── 3. Reference Number Format ─────────────────────────────────────── */}
      <div className="bg-white border border-[#E0E0E0] rounded-xl p-6">
        <div className="border-l-4 border-[#83358E] pl-3 mb-5">
          <div className="flex items-center gap-2">
            <Hash className="w-4 h-4 text-[#83358E]" />
            <h3 className="text-base font-bold text-[#001A4D]">Reference Number Format</h3>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">Configure the auto-generated reference number assigned to each submitted document.</p>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Prefix</label>
              <input
                type="text"
                maxLength={6}
                value={refPrefix}
                onChange={(e) => { setRefPrefix(e.target.value.toUpperCase()); ch(); }}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent font-mono"
              />
              <p className="text-xs text-gray-500 mt-1">Max 6 characters</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Separator</label>
              <select
                value={refSeparator}
                onChange={(e) => { setRefSeparator(e.target.value); ch(); }}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent font-mono"
              >
                <option value="-">- (dash)</option>
                <option value="/">&nbsp;/ (slash)</option>
                <option value="_">_ (underscore)</option>
                <option value=".">. (dot)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Number Padding (digits)</label>
              <input
                type="number"
                min={3}
                max={8}
                value={refPadding}
                onChange={(e) => { setRefPadding(+e.target.value); ch(); }}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent"
              />
            </div>
          </div>

          <div className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
            <div>
              <p className="text-sm font-medium text-gray-900">Include Year in Reference</p>
              <p className="text-xs text-gray-500">e.g. DOC-2026-0001 vs DOC-0001</p>
            </div>
            <Toggle value={refIncludeYear} onChange={(v) => { setRefIncludeYear(v); ch(); }} />
          </div>

          <div className="flex items-center gap-3 p-4 bg-[#F3E8FF] border border-[#83358E]/30 rounded-xl">
            <Hash className="w-4 h-4 text-[#83358E]" />
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Preview — next reference number:</p>
              <p className="text-[#83358E] font-bold font-mono text-lg">{refPreview}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── 4. Review Workflow ─────────────────────────────────────────────── */}
      <div className="bg-white border border-[#E0E0E0] rounded-xl p-6">
        <div className="border-l-4 border-[#83358E] pl-3 mb-5">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#83358E]" />
            <h3 className="text-base font-bold text-[#001A4D]">Review Workflow</h3>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">Set SLA targets, rejection rules, and resubmission limits.</p>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Review SLA (hours)</label>
              <input
                type="number"
                min={1}
                value={slaHours}
                onChange={(e) => { setSlaHours(+e.target.value); ch(); }}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">Target time for SAS to review a submitted document</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">SLA Warning Threshold (hours before breach)</label>
              <input
                type="number"
                min={1}
                value={slaWarningHours}
                onChange={(e) => { setSlaWarningHours(+e.target.value); ch(); }}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">Shows amber "X days in queue" warning in the admin table</p>
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-gray-100">
            <div className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-900">Require Remarks When Rejecting</p>
                <p className="text-xs text-gray-500">SAS must provide a reason before a rejection is confirmed.</p>
              </div>
              <Toggle value={requireRemarksOnReject} onChange={(v) => { setRequireRemarksOnReject(v); ch(); }} />
            </div>

            {requireRemarksOnReject && (
              <div className="ml-4 pl-3 border-l-2 border-[#83358E]/30">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Minimum Characters for Rejection Remarks</label>
                <input
                  type="number"
                  min={5}
                  max={100}
                  value={minRejectRemarkChars}
                  onChange={(e) => { setMinRejectRemarkChars(+e.target.value); ch(); }}
                  className="w-40 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent"
                />
              </div>
            )}

            <div className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-900">Allow Officers to Resubmit Rejected Documents</p>
                <p className="text-xs text-gray-500">Officers can upload a corrected version after rejection.</p>
              </div>
              <Toggle value={allowResubmission} onChange={(v) => { setAllowResubmission(v); ch(); }} />
            </div>

            {allowResubmission && (
              <div className="ml-4 pl-3 border-l-2 border-[#83358E]/30">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Maximum Resubmissions Allowed</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={maxResubmissions}
                  onChange={(e) => { setMaxResubmissions(+e.target.value); ch(); }}
                  className="w-40 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">After this limit, document is permanently closed.</p>
              </div>
            )}

            <div className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-900">Enable Quick Approve / Quick Reject (inline popovers)</p>
                <p className="text-xs text-gray-500">Let SAS approve or reject directly from the queue table without opening the full review page.</p>
              </div>
              <Toggle value={allowQuickApprove} onChange={(v) => { setAllowQuickApprove(v); ch(); }} />
            </div>

            <div className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-900">Enable "Request More Information" Status</p>
                <p className="text-xs text-gray-500">SAS can flag a document as needing more info without approving or rejecting.</p>
              </div>
              <Toggle value={infoRequestedStatus} onChange={(v) => { setInfoRequestedStatus(v); ch(); }} />
            </div>
          </div>
        </div>
      </div>

      {/* ── 5. Broadcast Categories ────────────────────────────────────────── */}
      <div className="bg-white border border-[#E0E0E0] rounded-xl p-6">
        <div className="border-l-4 border-[#83358E] pl-3 mb-5">
          <div className="flex items-center gap-2">
            <Files className="w-4 h-4 text-[#83358E]" />
            <h3 className="text-base font-bold text-[#001A4D]">Broadcast Categories & Defaults</h3>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">Configure the categories SAS can use when broadcasting documents to clubs, and set default notification preferences.</p>
        </div>

        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Available Broadcast Categories</p>
            <div className="grid grid-cols-2 gap-2">
              {broadcastCategories.map((cat, i) => (
                <label key={cat.id} className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-colors ${cat.active ? 'border-[#83358E]/40 bg-[#F3E8FF]/20' : 'border-gray-200'}`}>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={cat.active}
                      onChange={(e) => {
                        const updated = [...broadcastCategories];
                        updated[i] = { ...cat, active: e.target.checked };
                        setBroadcastCategories(updated);
                        ch();
                      }}
                      className="accent-[#83358E]"
                    />
                    <span className="text-sm text-gray-700">{cat.name}</span>
                  </div>
                  <span className={`text-xs font-medium ${cat.active ? 'text-[#83358E]' : 'text-gray-400'}`}>{cat.active ? 'Active' : 'Hidden'}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="pt-2 border-t border-gray-100">
            <p className="text-sm font-medium text-gray-700 mb-2">Default Notification Settings for Broadcasts</p>
            <div className="space-y-2">
              {[
                { label: 'Send Push Notification to Officers', desc: 'Officers receive an immediate push notification when a document is broadcast.', value: defaultPushNotif, set: setDefaultPushNotif },
                { label: 'Send In-App Notification', desc: 'Appears in the officer notification bell.', value: defaultInAppNotif, set: setDefaultInAppNotif },
                { label: 'Send Email Notification', desc: 'Email sent to registered officer addresses.', value: defaultEmailNotif, set: setDefaultEmailNotif },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{item.label}</p>
                    <p className="text-xs text-gray-500">{item.desc}</p>
                  </div>
                  <Toggle value={item.value} onChange={(v) => { item.set(v); ch(); }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── 6. Retention & Archive ─────────────────────────────────────────── */}
      <div className="bg-white border border-[#E0E0E0] rounded-xl p-6">
        <div className="border-l-4 border-[#83358E] pl-3 mb-5">
          <div className="flex items-center gap-2">
            <Archive className="w-4 h-4 text-[#83358E]" />
            <h3 className="text-base font-bold text-[#001A4D]">Retention & Archival</h3>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">Set how long documents are kept, when they are auto-archived, and what officers can delete.</p>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Document Retention Period (years)</label>
              <input
                type="number"
                min={1}
                max={20}
                value={retentionYears}
                onChange={(e) => { setRetentionYears(+e.target.value); ch(); }}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">Documents are preserved for this period before permanent deletion is allowed.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Draft Expiry (days inactive)</label>
              <input
                type="number"
                min={7}
                max={365}
                value={draftExpiryDays}
                onChange={(e) => { setDraftExpiryDays(+e.target.value); ch(); }}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">Unsent draft submissions are auto-deleted after this many days.</p>
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-gray-100">
            <div className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-900">Auto-Archive Completed Documents</p>
                <p className="text-xs text-gray-500">Approved and Rejected documents are automatically archived after a set period.</p>
              </div>
              <Toggle value={autoArchiveCompleted} onChange={(v) => { setAutoArchiveCompleted(v); ch(); }} />
            </div>

            {autoArchiveCompleted && (
              <div className="ml-4 pl-3 border-l-2 border-[#83358E]/30">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Archive After (semesters past)</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={archiveAfterSemesters}
                  onChange={(e) => { setArchiveAfterSemesters(+e.target.value); ch(); }}
                  className="w-40 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">Documents from semesters older than this threshold are archived automatically.</p>
              </div>
            )}

            <div className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-900">Allow Officers to Delete Draft Documents</p>
                <p className="text-xs text-gray-500">Officers can permanently delete their own unsent draft submissions. Submitted documents can never be deleted by officers.</p>
              </div>
              <Toggle value={allowOfficerDelete} onChange={(v) => { setAllowOfficerDelete(v); ch(); }} />
            </div>
          </div>
        </div>
      </div>

      {/* ── 7. Notification Triggers ───────────────────────────────────────── */}
      <div className="bg-white border border-[#E0E0E0] rounded-xl p-6">
        <div className="border-l-4 border-[#83358E] pl-3 mb-5">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-[#83358E]" />
            <h3 className="text-base font-bold text-[#001A4D]">EDMS Notification Triggers</h3>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">Control when SAS and officers receive notifications about document activity.</p>
        </div>

        <div className="space-y-2">
          {[
            { label: 'Notify SAS when officer submits a document', desc: 'SAS Admin receives an in-app + push notification for every new submission.', value: notifyOnSubmit, set: setNotifyOnSubmit },
            { label: 'Notify officer when decision is made', desc: 'Officer receives a notification when their document is approved, rejected, or flagged.', value: notifyOnDecision, set: setNotifyOnDecision },
            { label: 'Notify SAS when document exceeds SLA threshold', desc: `SAS receives a reminder when a pending document is within ${slaWarningHours}h of the ${slaHours}h SLA.`, value: notifyOnOverdue, set: setNotifyOnOverdue },
          ].map((item) => (
            <div key={item.label} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-900">{item.label}</p>
                <p className="text-xs text-gray-500">{item.desc}</p>
              </div>
              <Toggle value={item.value} onChange={(v) => { item.set(v); ch(); }} />
            </div>
          ))}

          {notifyOnOverdue && (
            <div className="ml-4 pl-3 border-l-2 border-[#83358E]/30">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">SLA Reminder Interval (hours)</label>
              <input
                type="number"
                min={1}
                max={48}
                value={overdueReminderHours}
                onChange={(e) => { setOverdueReminderHours(+e.target.value); ch(); }}
                className="w-40 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">Repeat reminder every X hours while document remains unreviewed past SLA.</p>
            </div>
          )}
        </div>
      </div>

      {/* Save Button */}
      <div className="flex items-center justify-between pt-2 pb-6">
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <RefreshCw className="w-3.5 h-3.5" />
          Changes apply to new submissions immediately. Existing documents are not affected.
        </div>
        <div className="flex gap-3">
          <button className="px-4 py-2.5 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition-colors">
            Reset to Defaults
          </button>
          <button
            onClick={() => onUnsavedChange()}
            className="px-6 py-2.5 bg-[#001A4D] text-white rounded-lg text-sm font-bold hover:bg-[#001A4D]/90 transition-colors flex items-center gap-2"
          >
            <Shield className="w-4 h-4" />
            Save Document Settings
          </button>
        </div>
      </div>
    </div>
  );
}
