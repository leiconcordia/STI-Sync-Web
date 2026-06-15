import { useState } from 'react';
import { Shield, Plus, Edit2, Archive, RotateCcw, Trash2, X, AlertTriangle } from 'lucide-react';
import {
  useRoles,
  createOfficerRole,
  updateOfficerRole,
  deleteOfficerRole,
  type OfficerRoleDocument
} from '../../../modules/roles';

interface RolesPermissionsProps {
  onUnsavedChange: () => void;
}

type ModalState =
  | { type: 'none' }
  | { type: 'add-role' }
  | { type: 'edit-role'; item: OfficerRoleDocument }
  | { type: 'archive-role'; item: OfficerRoleDocument }
  | { type: 'restore-role'; item: OfficerRoleDocument }
  | { type: 'delete-role'; item: OfficerRoleDocument };

function ConfirmModal({ type, name, onConfirm, onClose, deleteText, onDeleteTextChange, isSaving }: {
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
    <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
      <div className={`${cfg.header} px-6 py-4 flex items-center justify-between`}>
        <h3 className="text-white font-bold text-lg">{cfg.title}</h3>
        <button onClick={onClose} disabled={isSaving} className="text-white/70 hover:text-white p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-50"><X className="w-5 h-5" /></button>
      </div>
      <div className="p-6 space-y-4">
        {type === 'delete' && (
          <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">Permanently delete <span className="font-bold">{name}</span>? This cannot be undone.</p>
          </div>
        )}
        {type !== 'delete' && (
          <p className="text-sm text-gray-700">{type === 'archive' ? 'Archive' : 'Restore'} <span className="font-bold">{name}</span>?{type === 'archive' ? ' It can be restored later.' : ''}</p>
        )}
        {type === 'delete' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Type <span className="font-mono font-bold">DELETE</span> to confirm</label>
            <input type="text" value={deleteText} onChange={e => onDeleteTextChange?.(e.target.value)} disabled={isSaving}
              className="w-full px-3 py-2 border border-red-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 font-mono disabled:opacity-50" />
          </div>
        )}
        <div className="flex gap-3">
          <button onClick={onClose} disabled={isSaving} className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50 disabled:opacity-50">Cancel</button>
          <button onClick={onConfirm} disabled={isSaving || (type === 'delete' && deleteText !== 'DELETE')}
            className={`flex-1 py-2.5 text-white rounded-xl text-sm font-bold disabled:opacity-40 ${cfg.btn}`}>
            {isSaving ? 'Processing...' : cfg.label}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function RolesPermissions({ onUnsavedChange }: RolesPermissionsProps) {
  const { data: roles, loading } = useRoles();
  
  const [modal, setModal] = useState<ModalState>({ type: 'none' });
  const [isSaving, setIsSaving] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  const [roleForm, setRoleForm] = useState({ name: '', isRequired: false });

  const close = () => { if (!isSaving) { setModal({ type: 'none' }); setDeleteText(''); } };

  const handleSaveRole = async () => {
    setIsSaving(true);
    try {
      if (modal.type === 'add-role') {
        await createOfficerRole({ name: roleForm.name, isRequired: roleForm.isRequired, archived: false });
      } else if (modal.type === 'edit-role') {
        await updateOfficerRole(modal.item.id, { name: roleForm.name, isRequired: roleForm.isRequired });
      }
      onUnsavedChange();
      close();
    } catch (e) {
      console.error(e);
      alert('Failed to save role.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAction = async (actionFn: () => Promise<void>) => {
    setIsSaving(true);
    try {
      await actionFn();
      onUnsavedChange();
      close();
    } catch (e) {
      console.error(e);
      alert('Operation failed.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#001A4D]">Roles</h2>
          <p className="text-sm text-gray-500 mt-1">Configure officer roles</p>
        </div>
        <button 
          onClick={() => { setRoleForm({ name: '', isRequired: false }); setModal({ type: 'add-role' }); }}
          className="px-6 py-2.5 bg-[#0E4EBD] text-white rounded-lg font-medium hover:bg-[#0E4EBD]/90 flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Role
        </button>
      </div>

      <div className="bg-white border border-[#E0E0E0] rounded-xl p-6">
        <h3 className="text-lg font-bold text-[#001A4D] mb-4">Officer Roles</h3>
        
        {loading ? (
          <div className="text-sm text-gray-500 py-4">Loading roles...</div>
        ) : roles.length === 0 ? (
          <div className="text-sm text-gray-500 py-4 text-center border border-dashed border-gray-300 rounded-lg">
            No roles defined yet.
          </div>
        ) : (
          <div className="space-y-2">
            {roles.map((role) => (
              <div 
                key={role.id} 
                className={`flex items-center justify-between p-4 border rounded-lg transition-colors ${role.archived ? 'bg-gray-50 border-gray-200 opacity-60' : 'border-gray-200 hover:border-blue-300'}`}
                onMouseEnter={() => setHoveredRow(role.id)}
                onMouseLeave={() => setHoveredRow(null)}
              >
                <div className="flex items-center gap-4 flex-1">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-gray-100">
                    <Shield className="w-5 h-5 text-gray-500" />
                  </div>
                  <div className="flex-1 flex items-center gap-3">
                    <div>
                      <div className={`font-medium ${role.archived ? 'text-gray-500 line-through' : 'text-gray-900'}`}>{role.name}</div>
                      <div className="text-xs text-gray-500">
                        0 officers
                      </div>
                    </div>
                    {role.isRequired && !role.archived && (
                      <span className="px-2 py-0.5 bg-red-100 text-red-700 text-[10px] font-bold uppercase rounded tracking-wider">Required</span>
                    )}
                  </div>
                </div>
                
                <div className={`flex items-center gap-1 transition-opacity ${hoveredRow === role.id ? 'opacity-100' : 'opacity-0'}`}>
                  {!role.archived ? (
                    <>
                      <button onClick={() => { setRoleForm({ name: role.name, isRequired: role.isRequired }); setModal({ type: 'edit-role', item: role }); }} className="p-2 rounded hover:bg-blue-50 text-[#1E70E8]"><Edit2 className="w-4 h-4" /></button>
                      <button onClick={() => setModal({ type: 'archive-role', item: role })} className="p-2 rounded hover:bg-amber-50 text-amber-500"><Archive className="w-4 h-4" /></button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => setModal({ type: 'restore-role', item: role })} className="p-2 rounded hover:bg-green-50 text-green-600"><RotateCcw className="w-4 h-4" /></button>
                      <button onClick={() => setModal({ type: 'delete-role', item: role })} className="p-2 rounded hover:bg-red-50 text-red-600"><Trash2 className="w-4 h-4" /></button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* MODALS */}
      {modal.type !== 'none' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={close} />
          
          {/* ADD / EDIT ROLE */}
          {(modal.type === 'add-role' || modal.type === 'edit-role') && (
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
              <div className="bg-[#001A4D] px-6 py-4 flex items-center justify-between">
                <h3 className="text-white font-bold text-lg">{modal.type === 'add-role' ? 'Add Officer Role' : 'Edit Officer Role'}</h3>
                <button onClick={close} disabled={isSaving} className="text-white/70 hover:text-white p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-50"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Role Name <span className="text-red-500">*</span></label>
                  <input type="text" value={roleForm.name} onChange={e => setRoleForm({ ...roleForm, name: e.target.value })} disabled={isSaving}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#001A4D] focus:border-transparent disabled:opacity-50"
                    placeholder="e.g. President, Auditor" />
                </div>
                <div>
                  <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                    <input 
                      type="checkbox" 
                      checked={roleForm.isRequired} 
                      onChange={e => setRoleForm({ ...roleForm, isRequired: e.target.checked })} 
                      disabled={isSaving}
                      className="w-4 h-4 text-[#001A4D] rounded border-gray-300 focus:ring-[#001A4D] disabled:opacity-50" 
                    />
                    <div>
                      <div className="text-sm font-medium text-gray-900">Required Role</div>
                      <div className="text-xs text-gray-500">Must be assigned when creating a new organization</div>
                    </div>
                  </label>
                </div>
                <div className="flex gap-3 pt-2">
                  <button onClick={close} disabled={isSaving} className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50 disabled:opacity-50">Cancel</button>
                  <button onClick={handleSaveRole} disabled={!roleForm.name || isSaving}
                    className="flex-1 py-2.5 bg-[#001A4D] text-white rounded-xl text-sm font-bold hover:bg-[#001A4D]/90 disabled:opacity-40">
                    {isSaving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* CONFIRMS */}
          {modal.type === 'archive-role' && <ConfirmModal type="archive" name={modal.item.name} isSaving={isSaving} onConfirm={() => handleAction(() => updateOfficerRole(modal.item.id, { archived: true }))} onClose={close} />}
          {modal.type === 'restore-role' && <ConfirmModal type="restore" name={modal.item.name} isSaving={isSaving} onConfirm={() => handleAction(() => updateOfficerRole(modal.item.id, { archived: false }))} onClose={close} />}
          {modal.type === 'delete-role' && <ConfirmModal type="delete" name={modal.item.name} isSaving={isSaving} onConfirm={() => handleAction(() => deleteOfficerRole(modal.item.id))} onClose={close} deleteText={deleteText} onDeleteTextChange={setDeleteText} />}
        </div>
      )}
    </div>
  );
}
