import { useState, useEffect, useMemo } from 'react';
import {
  Plus, Edit2, Trash2, Shield, X, AlertTriangle, Archive, RotateCcw, Users, ArrowRight, Info,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useOrganizationTypes,
  useOrganizationRules,
  useOrganizationStream,
  createOrganizationType,
  updateOrganizationType,
  deleteOrganizationType,
  updateOrganizationRules,
  fetchAllMembershipsForLimitImpact,
  type OrganizationTypeDocument
} from '../../../modules/organizations';
import {
  analyzeGlobalLimitImpact,
  analyzeOrgTypeLimitImpact,
  findConflictingOrgTypesForGlobalLimit,
  normalizeMaxMembershipsPerStudent,
  validateOrgTypeArchival,
  validateOrgTypeLimitAgainstGlobal,
  type AffectedOverLimitStudent,
  type ConflictingOrgTypeLimit,
} from '../../../modules/organizations/utils/org-type-quota.utils';
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
  isSaving,
  blockedReason,
  blockingItems,
}: {
  type: 'archive' | 'restore' | 'delete';
  name: string;
  onConfirm: () => void;
  onClose: () => void;
  deleteText?: string;
  onDeleteTextChange?: (v: string) => void;
  isSaving: boolean;
  blockedReason?: string;
  blockingItems?: string[];
}) {
  const cfg = {
    archive: { header: 'bg-gradient-to-r from-amber-500 to-amber-600', title: 'Archive', btn: 'bg-amber-500 hover:bg-amber-600', label: 'Archive' },
    restore: { header: 'bg-gradient-to-r from-green-500 to-green-600', title: 'Restore', btn: 'bg-green-600 hover:bg-green-700', label: 'Restore' },
    delete: { header: 'bg-gradient-to-r from-red-500 to-orange-600', title: 'Permanently Delete', btn: 'bg-red-600 hover:bg-red-700', label: 'Delete Forever' },
  }[type];

  const isBlocked = Boolean(blockedReason);

  return (
    <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden z-50">
      <div className={`${cfg.header} px-6 py-4 flex items-center justify-between`}>
        <h3 className="text-white font-bold text-lg">{cfg.title}</h3>
        <button onClick={onClose} disabled={isSaving} className="text-white/70 hover:text-white p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-50 cursor-pointer">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="p-6 space-y-4">
        {isBlocked ? (
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3.5 bg-red-50 border border-red-200 rounded-xl">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div className="text-xs text-red-800 space-y-1">
                <p className="font-bold text-sm text-red-900">Action Blocked — Classification In Use</p>
                <p className="leading-relaxed">{blockedReason}</p>
              </div>
            </div>
            {blockingItems && blockingItems.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded-xl border border-gray-200 bg-gray-50/70 divide-y divide-gray-200/70 text-xs">
                {blockingItems.map((clubName, idx) => (
                  <div key={`${clubName}-${idx}`} className="px-3 py-2 font-medium text-gray-800">
                    • {clubName}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
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
          </>
        )}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
          >
            {isBlocked ? 'Close' : 'Cancel'}
          </button>
          {!isBlocked && (
            <button
              type="button"
              onClick={onConfirm}
              disabled={isSaving || (type === 'delete' && deleteText !== 'DELETE')}
              className={`flex-1 py-2.5 text-white rounded-xl text-sm font-bold disabled:opacity-40 cursor-pointer ${cfg.btn}`}
            >
              {isSaving ? 'Processing...' : cfg.label}
            </button>
          )}
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

  // ─── Types, Roles & Global Membership Rules Streams ─────────────────────────
  const { data: organizationTypes = [], loading: loadingTypes } = useOrganizationTypes();
  const { data: orgRules, loading: loadingRules } = useOrganizationRules();
  const { data: organizations = [] } = useOrganizationStream();
  const { data: roles = [], loading: loadingRoles } = useRoles();

  // ─── Global Membership Limit & Policy Impact Preview State ──────────────────
  const [globalMaxOrgsInput, setGlobalMaxOrgsInput] = useState('');
  const [isSavingGlobalLimit, setIsSavingGlobalLimit] = useState(false);
  const [isScanningImpact, setIsScanningImpact] = useState(false);
  const [policyImpactPreview, setPolicyImpactPreview] = useState<{
    kind: 'global' | 'org-type';
    title: string;
    proposedLimit: number;
    conflictingTypes: ConflictingOrgTypeLimit[];
    affectedStudents: AffectedOverLimitStudent[];
    orgTypeId?: string;
    orgTypeName?: string;
    orgTypeColor?: string;
  } | null>(null);

  const currentGlobalLimit = useMemo(
    () => normalizeMaxMembershipsPerStudent(orgRules?.maxTotalOrganizationsPerStudent),
    [orgRules?.maxTotalOrganizationsPerStudent]
  );

  useEffect(() => {
    const val = orgRules?.maxTotalOrganizationsPerStudent;
    setGlobalMaxOrgsInput(val && val > 0 ? String(val) : '');
  }, [orgRules?.maxTotalOrganizationsPerStudent]);

  const commitSaveGlobalMaxOrgs = async (
    parsedMax: number | null,
    conflictingTypes: ConflictingOrgTypeLimit[] = []
  ) => {
    setIsSavingGlobalLimit(true);
    try {
      await updateOrganizationRules({ maxTotalOrganizationsPerStudent: parsedMax });
      if (parsedMax !== null && conflictingTypes.length > 0) {
        await Promise.all(
          conflictingTypes.map((ct) =>
            updateOrganizationType(ct.id, { maxMembershipsPerStudent: parsedMax })
          )
        );
      }
      const cappedSuffix =
        conflictingTypes.length > 0
          ? ` (${conflictingTypes.length} organization type${conflictingTypes.length === 1 ? '' : 's'} auto-capped to ${parsedMax})`
          : '';
      toast.success(
        parsedMax
          ? `Global limit updated: students may join at most ${parsedMax} active organization${parsedMax === 1 ? '' : 's'} total${cappedSuffix}.`
          : 'Global limit removed: students have no total organization cap (per-type limits still apply).'
      );
      setPolicyImpactPreview(null);
      onUnsavedChange();
    } catch (err: any) {
      toast.error('Failed to save global membership limit: ' + (err?.message || 'Unexpected error'));
    } finally {
      setIsSavingGlobalLimit(false);
    }
  };

  const handleSaveGlobalMaxOrgs = async () => {
    const raw = globalMaxOrgsInput.trim();
    let parsedMax: number | null = null;
    if (raw !== '') {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
        toast.error('Global maximum organizations per student must be a whole number (0 or blank for unlimited).');
        return;
      }
      parsedMax = n > 0 ? n : null;
    }

    if (parsedMax !== null) {
      const conflictingTypes = findConflictingOrgTypesForGlobalLimit({
        proposedGlobalLimit: parsedMax,
        orgTypes: organizationTypes.filter((t) => !t.archived),
      });

      setIsScanningImpact(true);
      let affectedStudents: AffectedOverLimitStudent[] = [];
      try {
        const allMemberships = await fetchAllMembershipsForLimitImpact();
        const impact = analyzeGlobalLimitImpact({
          proposedGlobalLimit: parsedMax,
          allOrganizations: organizations,
          allMemberships,
        });
        affectedStudents = impact.affectedStudents;
      } catch (scanErr) {
        console.warn('[OrganizationSettings] Non-blocking global impact scan notice:', scanErr);
      } finally {
        setIsScanningImpact(false);
      }

      if (conflictingTypes.length > 0 || affectedStudents.length > 0) {
        setPolicyImpactPreview({
          kind: 'global',
          title: 'Global Maximum Organizations per Student',
          proposedLimit: parsedMax,
          conflictingTypes,
          affectedStudents,
        });
        return;
      }
    }

    await commitSaveGlobalMaxOrgs(parsedMax, []);
  };

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
  const liveTypeLimitValidation = useMemo(() => {
    const rawMax = orgTypeForm.maxMembershipsPerStudent.trim();
    if (rawMax === '') return { valid: true as const };
    const n = Number(rawMax);
    if (!Number.isInteger(n) || n < 0) {
      return {
        valid: false as const,
        reason: 'Maximum organizations per student must be a whole number (0 or blank for unlimited).',
      };
    }
    return validateOrgTypeLimitAgainstGlobal({
      proposedTypeLimit: n > 0 ? n : null,
      globalLimit: currentGlobalLimit,
      orgTypeName: orgTypeForm.name.trim() || 'This organization type',
    });
  }, [orgTypeForm.maxMembershipsPerStudent, orgTypeForm.name, currentGlobalLimit]);

  const commitSaveOrgType = async (params: {
    mode: 'add' | 'edit';
    id?: string;
    name: string;
    color: string;
    parsedMax: number | null;
  }) => {
    setIsSaving(true);
    try {
      if (params.mode === 'add') {
        await createOrganizationType({
          name: params.name,
          color: params.color,
          maxMembershipsPerStudent: params.parsedMax,
          archived: false,
        });
        toast.success(`Organization type "${params.name}" created successfully.`);
      } else if (params.mode === 'edit' && params.id) {
        await updateOrganizationType(params.id, {
          name: params.name,
          color: params.color,
          maxMembershipsPerStudent: params.parsedMax,
        });
        toast.success(`Organization type "${params.name}" updated successfully.`);
      }
      setPolicyImpactPreview(null);
      onUnsavedChange();
      close();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Failed to save organization type.');
    } finally {
      setIsSaving(false);
    }
  };

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

    // Cross-limit consistency check: Per-Type Limit must be <= Global Limit
    const vsGlobal = validateOrgTypeLimitAgainstGlobal({
      proposedTypeLimit: parsedMax,
      globalLimit: currentGlobalLimit,
      orgTypeName: cleanName,
    });
    if (!vsGlobal.valid) {
      toast.error(vsGlobal.reason || 'Per-type limit cannot exceed the Global Maximum Organizations per Student.');
      return;
    }

    // When lowering (or introducing) a finite limit on an existing type, scan affected students first
    if (modal.type === 'edit-org-type' && parsedMax !== null) {
      const prevMax = normalizeMaxMembershipsPerStudent(modal.item.maxMembershipsPerStudent);
      if (prevMax === null || parsedMax < prevMax) {
        setIsScanningImpact(true);
        let affectedStudents: AffectedOverLimitStudent[] = [];
        try {
          const allMemberships = await fetchAllMembershipsForLimitImpact();
          const impact = analyzeOrgTypeLimitImpact({
            orgTypeId: modal.item.id,
            proposedTypeLimit: parsedMax,
            allOrganizations: organizations,
            allMemberships,
          });
          affectedStudents = impact.affectedStudents;
        } catch (scanErr) {
          console.warn('[OrganizationSettings] Non-blocking org-type impact scan notice:', scanErr);
        } finally {
          setIsScanningImpact(false);
        }

        if (affectedStudents.length > 0) {
          setPolicyImpactPreview({
            kind: 'org-type',
            title: `${cleanName} Organization Limit`,
            proposedLimit: parsedMax,
            conflictingTypes: [],
            affectedStudents,
            orgTypeId: modal.item.id,
            orgTypeName: cleanName,
            orgTypeColor: orgTypeForm.color,
          });
          return;
        }
      }
    }

    await commitSaveOrgType({
      mode: modal.type === 'add-org-type' ? 'add' : 'edit',
      id: modal.type === 'edit-org-type' ? modal.item.id : undefined,
      name: cleanName,
      color: orgTypeForm.color,
      parsedMax,
    });
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
          TAB 2: ORGANIZATION TYPES & CONFIGURABLE MEMBERSHIP LIMITS
         ═══════════════════════════════════════════════════════════════════════ */}
      {subTab === 'types' && (
        <div className="space-y-4">
          {/* Global Configurable Student Membership Limit Card */}
          <div className="bg-white border border-[#E0E0E0] rounded-xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Shield className="w-4 h-4 text-[#0E4EBD]" />
                <h3 className="font-bold text-[#001A4D] text-sm">
                  Global Maximum Organizations per Student
                </h3>
                <span
                  className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${
                    orgRules?.maxTotalOrganizationsPerStudent && orgRules.maxTotalOrganizationsPerStudent > 0
                      ? 'bg-blue-50 text-[#001A4D] border-blue-200'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  }`}
                >
                  {loadingRules
                    ? 'Loading...'
                    : orgRules?.maxTotalOrganizationsPerStudent && orgRules.maxTotalOrganizationsPerStudent > 0
                    ? `Max ${orgRules.maxTotalOrganizationsPerStudent} total / student`
                    : 'Unlimited total'}
                </span>
              </div>
              <p className="text-xs text-gray-500 max-w-2xl leading-relaxed">
                Master ceiling on how many active organizations a student can belong to across all types combined.
                Per-type limits below must be <strong>≤ this global limit</strong> (or left blank to follow it). Leave blank or enter <strong>0</strong> for unlimited total memberships.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <input
                type="number"
                min={0}
                step={1}
                value={globalMaxOrgsInput}
                onChange={(e) => setGlobalMaxOrgsInput(e.target.value)}
                disabled={loadingRules || isSavingGlobalLimit || isScanningImpact}
                placeholder="Unlimited"
                className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-sm font-semibold text-[#001A4D] focus:ring-2 focus:ring-[#0E4EBD] outline-none disabled:opacity-50"
              />
              <button
                type="button"
                onClick={handleSaveGlobalMaxOrgs}
                disabled={loadingRules || isSavingGlobalLimit || isScanningImpact}
                className="px-4 py-2 bg-[#001A4D] hover:bg-[#0E4EBD] text-white text-xs font-bold rounded-lg transition-colors cursor-pointer disabled:opacity-50 shadow-xs"
              >
                {isScanningImpact ? 'Checking...' : isSavingGlobalLimit ? 'Saving...' : 'Save Limit'}
              </button>
            </div>
          </div>

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
              {(typeArchivedView ? archivedTypes : activeTypes).map((type) => {
                const archivalCheck = validateOrgTypeArchival({
                  orgTypeId: type.id,
                  orgTypeName: type.name,
                  allOrganizations: organizations,
                });
                return (
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
                    {archivalCheck.activeClubCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                        {archivalCheck.activeClubCount} active club{archivalCheck.activeClubCount === 1 ? '' : 's'}
                      </span>
                    )}
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${
                        type.maxMembershipsPerStudent && type.maxMembershipsPerStudent > 0
                          ? currentGlobalLimit !== null && type.maxMembershipsPerStudent > currentGlobalLimit
                            ? 'bg-amber-50 text-amber-800 border-amber-300'
                            : 'bg-blue-50 text-[#001A4D] border-blue-200'
                          : 'bg-gray-50 text-gray-500 border-gray-200'
                      }`}
                    >
                      {type.maxMembershipsPerStudent && type.maxMembershipsPerStudent > 0
                        ? `Max ${type.maxMembershipsPerStudent} org${type.maxMembershipsPerStudent === 1 ? '' : 's'} / student${
                            currentGlobalLimit !== null && type.maxMembershipsPerStudent > currentGlobalLimit
                              ? ` (capped by Global ${currentGlobalLimit})`
                              : ''
                          }`
                        : currentGlobalLimit !== null
                        ? `Follows Global Limit (${currentGlobalLimit})`
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
                          title={
                            archivalCheck.allowed
                              ? `Archive ${type.name}`
                              : archivalCheck.reason
                          }
                          onClick={() => setModal({ type: 'archive-org-type', item: type })}
                          className={`p-1.5 rounded cursor-pointer ${
                            archivalCheck.allowed
                              ? 'hover:bg-amber-50 text-amber-500'
                              : 'hover:bg-red-50 text-gray-400'
                          }`}
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
                );
              })}
            </div>
          )}
        </div>
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
                    max={currentGlobalLimit ?? undefined}
                    step="1"
                    value={orgTypeForm.maxMembershipsPerStudent}
                    onChange={e => setOrgTypeForm({ ...orgTypeForm, maxMembershipsPerStudent: e.target.value })}
                    disabled={isSaving || isScanningImpact}
                    className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:border-transparent disabled:opacity-50 ${
                      !liveTypeLimitValidation.valid
                        ? 'border-red-400 bg-red-50/40 focus:ring-red-500'
                        : 'border-gray-300 focus:ring-[#001A4D]'
                    }`}
                    placeholder={
                      currentGlobalLimit
                        ? `Up to ${currentGlobalLimit} (blank = follow Global Limit)`
                        : 'Leave blank or 0 for unlimited (e.g. 2)'
                    }
                  />
                  {!liveTypeLimitValidation.valid ? (
                    <div className="mt-1.5 flex items-start gap-1.5 p-2 rounded-lg bg-red-50 border border-red-200 text-[11px] font-medium text-red-700">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-red-600" />
                      <span>{liveTypeLimitValidation.reason}</span>
                    </div>
                  ) : (
                    <p className="text-[11px] text-gray-500 mt-1">
                      {currentGlobalLimit
                        ? `Must be ≤ Global Limit (${currentGlobalLimit}), or leave blank / 0 to follow the Global Limit of ${currentGlobalLimit}.`
                        : 'Caps how many active organizations of this type a single student can join at once (e.g. 2 for Academic). Leave blank or 0 for unlimited.'}
                    </p>
                  )}
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={close}
                    disabled={isSaving || isScanningImpact}
                    className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveOrgType}
                    disabled={!orgTypeForm.name.trim() || !liveTypeLimitValidation.valid || isSaving || isScanningImpact}
                    className="flex-1 py-2.5 bg-[#001A4D] text-white rounded-xl text-sm font-bold hover:bg-[#001A4D]/90 disabled:opacity-40"
                  >
                    {isScanningImpact ? 'Checking...' : isSaving ? 'Saving...' : 'Save Changes'}
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
          {modal.type === 'archive-org-type' && (() => {
            const check = validateOrgTypeArchival({
              orgTypeId: modal.item.id,
              orgTypeName: modal.item.name,
              allOrganizations: organizations,
            });
            return (
              <ConfirmModal
                type="archive"
                name={modal.item.name}
                isSaving={isSaving}
                blockedReason={check.allowed ? undefined : check.reason}
                blockingItems={check.activeClubNames}
                onConfirm={() => handleAction(() => updateOrganizationType(modal.item.id, { archived: true }))}
                onClose={close}
              />
            );
          })()}
          {modal.type === 'restore-org-type' && (
            <ConfirmModal
              type="restore"
              name={modal.item.name}
              isSaving={isSaving}
              onConfirm={() => handleAction(() => updateOrganizationType(modal.item.id, { archived: false }))}
              onClose={close}
            />
          )}
          {modal.type === 'delete-org-type' && (() => {
            const check = validateOrgTypeArchival({
              orgTypeId: modal.item.id,
              orgTypeName: modal.item.name,
              allOrganizations: organizations,
            });
            return (
              <ConfirmModal
                type="delete"
                name={modal.item.name}
                isSaving={isSaving}
                blockedReason={check.allowed ? undefined : check.reason}
                blockingItems={check.activeClubNames}
                deleteText={deleteText}
                onDeleteTextChange={setDeleteText}
                onConfirm={() => handleAction(() => deleteOrganizationType(modal.item.id))}
                onClose={close}
              />
            );
          })()}

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

      {/* ═══════════════════════════════════════════════════════════════════════
          MEMBERSHIP POLICY CHANGE IMPACT CONFIRMATION MODAL
         ═══════════════════════════════════════════════════════════════════════ */}
      {policyImpactPreview && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-xs"
            onClick={() => {
              if (!isSaving && !isSavingGlobalLimit) setPolicyImpactPreview(null);
            }}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden z-50 border border-gray-200">
            {/* Header */}
            <div className="bg-gradient-to-r from-[#001A4D] to-[#0E4EBD] px-6 py-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-400/20 text-[#FFD41C] flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-white font-bold text-base">Review Membership Policy Impact</h3>
                  <p className="text-[11px] text-blue-100/90">
                    {policyImpactPreview.title} → Max {policyImpactPreview.proposedLimit} org
                    {policyImpactPreview.proposedLimit === 1 ? '' : 's'} / student
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={isSaving || isSavingGlobalLimit}
                onClick={() => setPolicyImpactPreview(null)}
                className="text-white/70 hover:text-white p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-50 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0 text-xs">
              {/* Section 1: Conflicting Organization Types to Auto-Cap */}
              {policyImpactPreview.conflictingTypes.length > 0 && (
                <div className="p-4 rounded-xl bg-blue-50/80 border border-blue-200 space-y-2.5">
                  <div className="flex items-start gap-2">
                    <Shield className="w-4 h-4 text-[#0E4EBD] shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold text-[#001A4D]">
                        {policyImpactPreview.conflictingTypes.length} Organization Type Limit
                        {policyImpactPreview.conflictingTypes.length === 1 ? '' : 's'} Exceed New Global Cap
                      </div>
                      <p className="text-slate-600 mt-0.5">
                        Per-type limits cannot exceed the Global Maximum ({policyImpactPreview.proposedLimit}). Confirming will automatically cap the following type
                        {policyImpactPreview.conflictingTypes.length === 1 ? '' : 's'}:
                      </p>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    {policyImpactPreview.conflictingTypes.map((ct) => (
                      <div
                        key={ct.id}
                        className="flex items-center justify-between px-3 py-2 rounded-lg bg-white border border-blue-100"
                      >
                        <span className="font-semibold text-slate-800">{ct.name}</span>
                        <span className="inline-flex items-center gap-1.5 font-mono font-bold">
                          <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                            {ct.currentLimit}
                          </span>
                          <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                          <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                            {ct.newCappedLimit}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Section 2: Existing Students Currently Over the New Limit */}
              {policyImpactPreview.affectedStudents.length > 0 && (
                <div className="p-4 rounded-xl bg-amber-50/90 border border-amber-200 space-y-3">
                  <div className="flex items-start gap-2">
                    <Users className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold text-amber-950">
                        {policyImpactPreview.affectedStudents.length} Existing Student
                        {policyImpactPreview.affectedStudents.length === 1 ? '' : 's'} Currently Exceed Limit of{' '}
                        {policyImpactPreview.proposedLimit}
                      </div>
                      <p className="text-amber-900/90 mt-0.5 leading-relaxed">
                        <strong>Grandfathering Policy:</strong> Saving this change will <strong>not</strong> remove any existing memberships. Affected students keep their current organizations, but will be{' '}
                        <strong>blocked from joining any new organizations</strong> until their active count drops below{' '}
                        {policyImpactPreview.proposedLimit}.
                      </p>
                    </div>
                  </div>

                  <div className="max-h-48 overflow-y-auto rounded-lg border border-amber-200 bg-white divide-y divide-amber-100">
                    {policyImpactPreview.affectedStudents.slice(0, 25).map((st) => (
                      <div key={st.studentKey} className="px-3 py-2 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-800 truncate">{st.studentName}</div>
                          <div className="text-[11px] text-slate-500 truncate">
                            {st.studentId} • {st.orgNames.join(', ')}
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 font-bold text-[11px] shrink-0">
                          {st.currentCount} orgs
                        </span>
                      </div>
                    ))}
                    {policyImpactPreview.affectedStudents.length > 25 && (
                      <div className="px-3 py-2 text-center text-[11px] font-semibold text-amber-800 bg-amber-50/50">
                        ...and {policyImpactPreview.affectedStudents.length - 25} more student(s)
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="flex items-start gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600">
                <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                <span>
                  New joins and applications (both Web Portal and Mobile App) will immediately enforce this updated limit upon saving.
                </span>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-end gap-2.5 shrink-0">
              <button
                type="button"
                disabled={isSaving || isSavingGlobalLimit}
                onClick={() => setPolicyImpactPreview(null)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-xl text-xs font-semibold hover:bg-gray-100 disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSaving || isSavingGlobalLimit}
                onClick={() => {
                  if (policyImpactPreview.kind === 'global') {
                    commitSaveGlobalMaxOrgs(
                      policyImpactPreview.proposedLimit,
                      policyImpactPreview.conflictingTypes
                    );
                  } else if (policyImpactPreview.orgTypeId && policyImpactPreview.orgTypeName) {
                    commitSaveOrgType({
                      mode: 'edit',
                      id: policyImpactPreview.orgTypeId,
                      name: policyImpactPreview.orgTypeName,
                      color: policyImpactPreview.orgTypeColor || '#0E4EBD',
                      parsedMax: policyImpactPreview.proposedLimit,
                    });
                  }
                }}
                className="px-4 py-2 bg-[#001A4D] hover:bg-[#0E4EBD] text-white rounded-xl text-xs font-bold disabled:opacity-50 cursor-pointer shadow-xs"
              >
                {isSaving || isSavingGlobalLimit
                  ? 'Saving...'
                  : policyImpactPreview.conflictingTypes.length > 0
                  ? 'Confirm, Auto-Cap & Save'
                  : 'Confirm & Save Limit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
