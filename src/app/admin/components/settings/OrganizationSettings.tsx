import { useState, useEffect } from 'react';
import {
  Plus, Edit2, Trash2, Shield, X, AlertTriangle, Archive, RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useOrganizationTypes,
  createOrganizationType,
  updateOrganizationType,
  deleteOrganizationType,
  type OrganizationTypeDocument
} from '../../../modules/organizations';
import {
  useRoles,
  createOfficerRole,
  updateOfficerRole,
  deleteOfficerRole,
  type OfficerRoleDocument
} from '../../../modules/roles';

interface OrganizationSettingsProps {
  onUnsavedChange: () => void;
  initialSubTab?: 'types' | 'roles';
}

type SubTab = 'types' | 'roles';

type ModalState =
  | { type: 'none' }
  | { type: 'add-org-type' }
  | { type: 'edit-org-type'; item: OrganizationTypeDocument }
  | { type: 'archive-org-type'; item: OrganizationTypeDocument }
  | { type: 'restore-org-type'; item: OrganizationTypeDocument }
  | { type: 'delete-org-type'; item: OrganizationTypeDocument }
  | { type: 'add-role' }
  | { type: 'edit-role'; item: OfficerRoleDocument }
  | { type: 'archive-role'; item: OfficerRoleDocument }
  | { type: 'restore-role'; item: OfficerRoleDocument }
  | { type: 'delete-role'; item: OfficerRoleDocument };

function ActiveArchivedTabs({ active, onChange }: { active: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
      <button
        type="button"
        onClick={() => onChange(false)}
        className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
          !active ? 'bg-white text-[#001A4D] shadow-xs' : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        Active
      </button>
      <button
        type="button"
        onClick={() => onChange(true)}
        className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
          active ? 'bg-white text-[#001A4D] shadow-xs' : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        Archived
      </button>
    </div>
  );
}

function ConfirmModal({
  type,
  name,
  onConfirm,
  onClose,
  deleteText,
  onDeleteTextChange,
  isSaving
}: {
  type: 'archive' | 'restore' | 'delete';
  name: string;
  onConfirm: () => void;
  onClose: () => void;
  deleteText?: string;
  onDeleteTextChange?: (v: string) => void;
  isSaving: boolean;
}) {
  const cfg = {
    archive: { header: 'bg-gradient-to-r from-amber-500 to-amber-600', title: 'Archive', btn: 'bg-amber-500 hover:bg-amber-600', label: 'Archive' },
    restore: { header: 'bg-gradient-to-r from-green-500 to-green-600', title: 'Restore', btn: 'bg-green-600 hover:bg-green-700', label: 'Restore' },
    delete: { header: 'bg-gradient-to-r from-red-500 to-orange-600', title: 'Permanently Delete', btn: 'bg-red-600 hover:bg-red-700', label: 'Delete Forever' },
  }[type];

  return (
    <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden z-50">
      <div className={`${cfg.header} px-6 py-4 flex items-center justify-between`}>
        <h3 className="text-white font-bold text-lg">{cfg.title}</h3>
        <button onClick={onClose} disabled={isSaving} className="text-white/70 hover:text-white p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-50">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="p-6 space-y-4">
        {type === 'delete' && (
          <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">Permanently delete <span className="font-bold">{name}</span>? This cannot be undone.</p>
          </div>
        )}
        {type !== 'delete' && (
          <p className="text-sm text-gray-700">
            {type === 'archive' ? 'Archive' : 'Restore'} <span className="font-bold">{name}</span>?
            {type === 'archive' ? ' It can be restored later.' : ''}
          </p>
        )}
        {type === 'delete' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Type <span className="font-mono font-bold">DELETE</span> to confirm
            </label>
            <input
              type="text"
              value={deleteText}
              onChange={e => onDeleteTextChange?.(e.target.value)}
              disabled={isSaving}
              className="w-full px-3 py-2 border border-red-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 font-mono disabled:opacity-50"
            />
          </div>
        )}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isSaving || (type === 'delete' && deleteText !== 'DELETE')}
            className={`flex-1 py-2.5 text-white rounded-xl text-sm font-bold disabled:opacity-40 ${cfg.btn}`}
          >
            {isSaving ? 'Processing...' : cfg.label}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function OrganizationSettings({ onUnsavedChange, initialSubTab = 'types' }: OrganizationSettingsProps) {
  const [subTab, setSubTab] = useState<SubTab>(initialSubTab);

  useEffect(() => {
    if (initialSubTab) {
      setSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  // ─── Types & Roles Streams ──────────────────────────────────────────────────
  const { data: organizationTypes = [], loading: loadingTypes } = useOrganizationTypes();
  const { data: roles = [], loading: loadingRoles } = useRoles();

  // ─── Types & Roles State ───────────────────────────────────────────────────
  const [typeArchivedView, setTypeArchivedView] = useState(false);
  const [roleArchivedView, setRoleArchivedView] = useState(false);
  const [modal, setModal] = useState<ModalState>({ type: 'none' });
  const [isSaving, setIsSaving] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  const [orgTypeForm, setOrgTypeForm] = useState({
    name: '',
    color: '#0E4EBD',
    maxMembershipsPerStudent: '',
  });
  const [roleForm, setRoleForm] = useState({ name: '', isRequired: false });

  const close = () => {
    if (!isSaving) {
      setModal({ type: 'none' });
      setDeleteText('');
    }
  };

  const activeTypes = organizationTypes.filter(t => !t.archived);
  const archivedTypes = organizationTypes.filter(t => t.archived);

  const activeRoles = roles.filter(r => !r.archived);
  const archivedRoles = roles.filter(r => r.archived);

  // ─── Save Handlers for Types ───────────────────────────────────────────────
  const handleSaveOrgType = async () => {
    const cleanName = orgTypeForm.name.trim();
    if (!cleanName) {
      toast.error('Organization type name is required.');
      return;
    }

    // Duplicate check
    const currentId = modal.type === 'edit-org-type' ? modal.item.id : null;
    const duplicate = activeTypes.find(
      t => t.id !== currentId && t.name.trim().toLowerCase() === cleanName.toLowerCase()
    );
    if (duplicate) {
      toast.error(`An organization type named "${cleanName}" already exists.`);
      return;
    }

    const rawMax = orgTypeForm.maxMembershipsPerStudent.trim();
    let parsedMax: number | null = null;
    if (rawMax !== '') {
      const n = Number(rawMax);
      if (!Number.isInteger(n) || n < 0) {
        toast.error('Maximum organizations per student must be a whole number (0 or blank for unlimited).');
        return;
      }
      parsedMax = n > 0 ? n : null;
    }

    setIsSaving(true);
    try {
      if (modal.type === 'add-org-type') {
        await createOrganizationType({
          name: cleanName,
          color: orgTypeForm.color,
          maxMembershipsPerStudent: parsedMax,
          archived: false,
        });
        toast.success(`Organization type "${cleanName}" created successfully.`);
      } else if (modal.type === 'edit-org-type') {
        await updateOrganizationType(modal.item.id, {
          name: cleanName,
          color: orgTypeForm.color,
          maxMembershipsPerStudent: parsedMax,
        });
        toast.success(`Organization type "${cleanName}" updated successfully.`);
      }
      onUnsavedChange();
      close();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Failed to save organization type.');
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Save Handlers for Roles ───────────────────────────────────────────────
  const handleSaveRole = async () => {
    const cleanName = roleForm.name.trim();
    if (!cleanName) {
      toast.error('Role name is required.');
      return;
    }

    // Duplicate check
    const currentId = modal.type === 'edit-role' ? modal.item.id : null;
    const duplicate = activeRoles.find(
      r => r.id !== currentId && r.name.trim().toLowerCase() === cleanName.toLowerCase()
    );
    if (duplicate) {
      toast.error(`An officer role named "${cleanName}" already exists.`);
      return;
    }

    setIsSaving(true);
    try {
      if (modal.type === 'add-role') {
        await createOfficerRole({ name: cleanName, isRequired: roleForm.isRequired, archived: false });
        toast.success(`Officer role "${cleanName}" created successfully.`);
      } else if (modal.type === 'edit-role') {
        await updateOfficerRole(modal.item.id, { name: cleanName, isRequired: roleForm.isRequired });
        toast.success(`Officer role "${cleanName}" updated successfully.`);
      }
      onUnsavedChange();
      close();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Failed to save role.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAction = async (actionFn: () => Promise<void>) => {
    setIsSaving(true);
    try {
      await actionFn();
      toast.success('Action completed successfully.');
      onUnsavedChange();
      close();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Operation failed.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-[#001A4D]">Organization Settings</h2>
        <p className="text-sm text-gray-500 mt-1">
          Manage organization classifications, membership caps, and officer roles
        </p>
      </div>

      {/* Sub-Tab Navigation Header */}
      <div className="flex items-center gap-2 border-b border-gray-200">
        {[
          { key: 'types' as SubTab, label: 'Organization Types' },
          { key: 'roles' as SubTab, label: 'Officer Roles' }
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setSubTab(tab.key)}
            className={`px-5 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-px cursor-pointer ${
              subTab === tab.key
                ? 'border-[#001A4D] text-[#001A4D]'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          TAB 2: ORGANIZATION TYPES
         ═══════════════════════════════════════════════════════════════════════ */}
      {subTab === 'types' && (
        <div className="bg-white border border-[#E0E0E0] rounded-xl overflow-hidden shadow-xs">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <h3 className="font-bold text-[#001A4D]">Organization Classifications</h3>
              <ActiveArchivedTabs active={typeArchivedView} onChange={setTypeArchivedView} />
            </div>
            <button
              type="button"
              onClick={() => {
                setOrgTypeForm({ name: '', color: '#0E4EBD', maxMembershipsPerStudent: '' });
                setModal({ type: 'add-org-type' });
              }}
              className="px-4 py-2 bg-[#001A4D] text-white rounded-lg text-sm font-bold hover:bg-[#001A4D]/90 flex items-center gap-2 cursor-pointer shadow-xs"
            >
              <Plus className="w-4 h-4" /> Add Type
            </button>
          </div>

          {loadingTypes ? (
            <div className="text-sm text-gray-500 py-6 text-center">Loading organization types...</div>
          ) : (typeArchivedView ? archivedTypes : activeTypes).length === 0 ? (
            <div className="text-sm text-gray-400 py-8 text-center">
              No {typeArchivedView ? 'archived' : 'active'} organization types.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {(typeArchivedView ? archivedTypes : activeTypes).map((type) => (
                <div
                  key={type.id}
                  className="flex items-center justify-between p-4 hover:bg-gray-50/80 transition-colors"
                  onMouseEnter={() => setHoveredRow(type.id)}
                  onMouseLeave={() => setHoveredRow(null)}
                >
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="w-4 h-4 rounded-full shadow-xs" style={{ backgroundColor: type.color }} />
                    <span className={`font-semibold text-sm ${type.archived ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                      {type.name}
                    </span>
                    <span className="text-xs font-mono text-gray-400">{type.color}</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${
                        type.maxMembershipsPerStudent && type.maxMembershipsPerStudent > 0
                          ? 'bg-blue-50 text-[#001A4D] border-blue-200'
                          : 'bg-gray-50 text-gray-500 border-gray-200'
                      }`}
                    >
                      {type.maxMembershipsPerStudent && type.maxMembershipsPerStudent > 0
                        ? `Max ${type.maxMembershipsPerStudent} org${type.maxMembershipsPerStudent === 1 ? '' : 's'} / student`
                        : 'Unlimited / student'}
                    </span>
                  </div>

                  <div className={`flex items-center gap-1 transition-opacity ${hoveredRow === type.id ? 'opacity-100' : 'opacity-0'}`}>
                    {!type.archived ? (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setOrgTypeForm({
                              name: type.name,
                              color: type.color,
                              maxMembershipsPerStudent:
                                type.maxMembershipsPerStudent && type.maxMembershipsPerStudent > 0
                                  ? String(type.maxMembershipsPerStudent)
                                  : '',
                            });
                            setModal({ type: 'edit-org-type', item: type });
                          }}
                          className="p-1.5 rounded hover:bg-blue-50 text-[#1E70E8] cursor-pointer"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setModal({ type: 'archive-org-type', item: type })}
                          className="p-1.5 rounded hover:bg-amber-50 text-amber-500 cursor-pointer"
                        >
                          <Archive className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => setModal({ type: 'restore-org-type', item: type })}
                          className="p-1.5 rounded hover:bg-green-50 text-green-600 cursor-pointer"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setModal({ type: 'delete-org-type', item: type })}
                          className="p-1.5 rounded hover:bg-red-50 text-red-600 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          TAB 3: OFFICER ROLES (TRANSFERRED FROM ROLES & PERMISSIONS)
         ═══════════════════════════════════════════════════════════════════════ */}
      {subTab === 'roles' && (
        <div className="bg-white border border-[#E0E0E0] rounded-xl overflow-hidden shadow-xs">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <h3 className="font-bold text-[#001A4D]">Officer Roles & Positions</h3>
              <ActiveArchivedTabs active={roleArchivedView} onChange={setRoleArchivedView} />
            </div>
            <button
              type="button"
              onClick={() => {
                setRoleForm({ name: '', isRequired: false });
                setModal({ type: 'add-role' });
              }}
              className="px-4 py-2 bg-[#001A4D] text-white rounded-lg text-sm font-bold hover:bg-[#001A4D]/90 flex items-center gap-2 cursor-pointer shadow-xs"
            >
              <Plus className="w-4 h-4" /> Add Role
            </button>
          </div>

          {loadingRoles ? (
            <div className="text-sm text-gray-500 py-6 text-center">Loading officer roles...</div>
          ) : (roleArchivedView ? archivedRoles : activeRoles).length === 0 ? (
            <div className="text-sm text-gray-400 py-8 text-center">
              No {roleArchivedView ? 'archived' : 'active'} officer roles defined yet.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {(roleArchivedView ? archivedRoles : activeRoles).map((role) => (
                <div
                  key={role.id}
                  className="flex items-center justify-between p-4 hover:bg-gray-50/80 transition-colors"
                  onMouseEnter={() => setHoveredRow(role.id)}
                  onMouseLeave={() => setHoveredRow(null)}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-blue-50 text-[#001A4D]">
                      <Shield className="w-4 h-4" />
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`font-semibold text-sm ${role.archived ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                        {role.name}
                      </span>
                      {role.isRequired && !role.archived && (
                        <span className="px-2 py-0.5 bg-red-100 text-red-700 text-[10px] font-bold uppercase rounded tracking-wider">
                          Mandatory Role
                        </span>
                      )}
                    </div>
                  </div>

                  <div className={`flex items-center gap-1 transition-opacity ${hoveredRow === role.id ? 'opacity-100' : 'opacity-0'}`}>
                    {!role.archived ? (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setRoleForm({ name: role.name, isRequired: !!role.isRequired });
                            setModal({ type: 'edit-role', item: role });
                          }}
                          className="p-1.5 rounded hover:bg-blue-50 text-[#1E70E8] cursor-pointer"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setModal({ type: 'archive-role', item: role })}
                          className="p-1.5 rounded hover:bg-amber-50 text-amber-500 cursor-pointer"
                        >
                          <Archive className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => setModal({ type: 'restore-role', item: role })}
                          className="p-1.5 rounded hover:bg-green-50 text-green-600 cursor-pointer"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setModal({ type: 'delete-role', item: role })}
                          className="p-1.5 rounded hover:bg-red-50 text-red-600 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          SHARED MODALS FOR TYPES & ROLES
         ═══════════════════════════════════════════════════════════════════════ */}
      {modal.type !== 'none' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-xs" onClick={close} />

          {/* ADD / EDIT TYPE */}
          {(modal.type === 'add-org-type' || modal.type === 'edit-org-type') && (
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden z-50">
              <div className="bg-[#001A4D] px-6 py-4 flex items-center justify-between">
                <h3 className="text-white font-bold text-lg">
                  {modal.type === 'add-org-type' ? 'Add Organization Type' : 'Edit Organization Type'}
                </h3>
                <button onClick={close} disabled={isSaving} className="text-white/70 hover:text-white p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-50">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Type Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={orgTypeForm.name}
                    onChange={e => setOrgTypeForm({ ...orgTypeForm, name: e.target.value })}
                    disabled={isSaving}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#001A4D] focus:border-transparent disabled:opacity-50"
                    placeholder="e.g. Academic, Civic, Special Interest"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Badge Color <span className="text-red-500">*</span>
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={orgTypeForm.color}
                      onChange={e => setOrgTypeForm({ ...orgTypeForm, color: e.target.value })}
                      disabled={isSaving}
                      className="w-10 h-10 rounded border border-gray-300 cursor-pointer disabled:opacity-50"
                    />
                    <input
                      type="text"
                      value={orgTypeForm.color}
                      onChange={e => setOrgTypeForm({ ...orgTypeForm, color: e.target.value })}
                      disabled={isSaving}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono uppercase focus:ring-2 focus:ring-[#001A4D] focus:border-transparent disabled:opacity-50"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Max Organizations a Student Can Join
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={orgTypeForm.maxMembershipsPerStudent}
                    onChange={e => setOrgTypeForm({ ...orgTypeForm, maxMembershipsPerStudent: e.target.value })}
                    disabled={isSaving}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#001A4D] focus:border-transparent disabled:opacity-50"
                    placeholder="Leave blank or 0 for unlimited (e.g. 2)"
                  />
                  <p className="text-[11px] text-gray-500 mt-1">
                    Caps how many active organizations of this type a single student can join at once (e.g. 2 for Academic). Leave blank or 0 for unlimited.
                  </p>
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={close}
                    disabled={isSaving}
                    className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveOrgType}
                    disabled={!orgTypeForm.name.trim() || isSaving}
                    className="flex-1 py-2.5 bg-[#001A4D] text-white rounded-xl text-sm font-bold hover:bg-[#001A4D]/90 disabled:opacity-40"
                  >
                    {isSaving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ADD / EDIT ROLE */}
          {(modal.type === 'add-role' || modal.type === 'edit-role') && (
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden z-50">
              <div className="bg-[#001A4D] px-6 py-4 flex items-center justify-between">
                <h3 className="text-white font-bold text-lg">
                  {modal.type === 'add-role' ? 'Add Officer Role' : 'Edit Officer Role'}
                </h3>
                <button onClick={close} disabled={isSaving} className="text-white/70 hover:text-white p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-50">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Role Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={roleForm.name}
                    onChange={e => setRoleForm({ ...roleForm, name: e.target.value })}
                    disabled={isSaving}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#001A4D] focus:border-transparent disabled:opacity-50"
                    placeholder="e.g. President, Vice President, Auditor"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={roleForm.isRequired}
                      onChange={e => setRoleForm({ ...roleForm, isRequired: e.target.checked })}
                      disabled={isSaving}
                      className="w-4 h-4 text-[#001A4D] rounded border-gray-300 focus:ring-[#001A4D] disabled:opacity-50 cursor-pointer"
                    />
                    <div>
                      <div className="text-sm font-semibold text-gray-900">Mandatory Position</div>
                      <div className="text-xs text-gray-500">Every organization must assign this role during officer roster registration</div>
                    </div>
                  </label>
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={close}
                    disabled={isSaving}
                    className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveRole}
                    disabled={!roleForm.name.trim() || isSaving}
                    className="flex-1 py-2.5 bg-[#001A4D] text-white rounded-xl text-sm font-bold hover:bg-[#001A4D]/90 disabled:opacity-40"
                  >
                    {isSaving ? 'Saving...' : 'Save Role'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TYPE CONFIRMS */}
          {modal.type === 'archive-org-type' && (
            <ConfirmModal
              type="archive"
              name={modal.item.name}
              isSaving={isSaving}
              onConfirm={() => handleAction(() => updateOrganizationType(modal.item.id, { archived: true }))}
              onClose={close}
            />
          )}
          {modal.type === 'restore-org-type' && (
            <ConfirmModal
              type="restore"
              name={modal.item.name}
              isSaving={isSaving}
              onConfirm={() => handleAction(() => updateOrganizationType(modal.item.id, { archived: false }))}
              onClose={close}
            />
          )}
          {modal.type === 'delete-org-type' && (
            <ConfirmModal
              type="delete"
              name={modal.item.name}
              isSaving={isSaving}
              deleteText={deleteText}
              onDeleteTextChange={setDeleteText}
              onConfirm={() => handleAction(() => deleteOrganizationType(modal.item.id))}
              onClose={close}
            />
          )}

          {/* ROLE CONFIRMS */}
          {modal.type === 'archive-role' && (
            <ConfirmModal
              type="archive"
              name={modal.item.name}
              isSaving={isSaving}
              onConfirm={() => handleAction(() => updateOfficerRole(modal.item.id, { archived: true }))}
              onClose={close}
            />
          )}
          {modal.type === 'restore-role' && (
            <ConfirmModal
              type="restore"
              name={modal.item.name}
              isSaving={isSaving}
              onConfirm={() => handleAction(() => updateOfficerRole(modal.item.id, { archived: false }))}
              onClose={close}
            />
          )}
          {modal.type === 'delete-role' && (
            <ConfirmModal
              type="delete"
              name={modal.item.name}
              isSaving={isSaving}
              deleteText={deleteText}
              onDeleteTextChange={setDeleteText}
              onConfirm={() => handleAction(() => deleteOfficerRole(modal.item.id))}
              onClose={close}
            />
          )}
        </div>
      )}
    </div>
  );
}
