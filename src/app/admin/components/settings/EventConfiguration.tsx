import { useState } from 'react';
import { Plus, Archive, RotateCcw, Trash2, Edit2, X, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useVenuesStream, useEventConfigMutations, VenueDocument } from '@/app/modules/events';

interface EventConfigurationProps {
  onUnsavedChange: () => void;
}

type ModalState =
  | { type: 'none' }
  | { type: 'add-venue' }
  | { type: 'edit-venue'; item: VenueDocument }
  | { type: 'archive-venue'; item: VenueDocument }
  | { type: 'restore-venue'; item: VenueDocument }
  | { type: 'delete-venue'; item: VenueDocument };

function ActiveArchivedTabs({ active, onChange }: { active: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
      <button onClick={() => onChange(false)}
        className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${!active ? 'bg-white text-[#001A4D] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
        Active
      </button>
      <button onClick={() => onChange(true)}
        className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${active ? 'bg-white text-[#001A4D] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
        Archived
      </button>
    </div>
  );
}

export default function EventConfiguration({ onUnsavedChange }: EventConfigurationProps) {
  const { venues, loading: loadingVenues } = useVenuesStream();
  const mutations = useEventConfigMutations();

  const [venueArchivedView, setVenueArchivedView] = useState(false);

  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>({ type: 'none' });
  const [deleteText, setDeleteText] = useState('');

  const [venueForm, setVenueForm] = useState({
    name: '',
    venueType: 'inside' as 'inside' | 'outside',
    status: 'available' as VenueDocument['status'],
  });

  const close = () => { setModal({ type: 'none' }); setDeleteText(''); };

  const activeVenues = venues.filter(v => !v.archived);
  const archivedVenues = venues.filter(v => v.archived);

  const statusPill = (s: VenueDocument['status']) =>
    s === 'available' ? 'bg-green-100 text-green-700' :
      s === 'maintenance' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700';

  const saveVenue = async () => {
    const cleanName = venueForm.name.trim();
    if (!cleanName) {
      toast.error('Venue name is required.');
      return;
    }

    // Check duplicate among active venues
    const currentId = modal.type === 'edit-venue' ? modal.item.id : null;
    const duplicate = activeVenues.find(
      (v) => v.id !== currentId && v.name.trim().toLowerCase() === cleanName.toLowerCase()
    );
    if (duplicate) {
      toast.error(`A venue named "${cleanName}" already exists.`);
      return;
    }

    try {
      if (modal.type === 'add-venue') {
        const res = await mutations.createVenue({ ...venueForm, name: cleanName, archived: false });
        if (res === null && mutations.error) {
          toast.error(mutations.error.message || 'Failed to create venue.');
          return;
        }
        toast.success(`Venue "${cleanName}" created successfully.`);
      } else if (modal.type === 'edit-venue') {
        const res = await mutations.updateVenue(modal.item.id, { ...venueForm, name: cleanName });
        if (res === null && mutations.error) {
          toast.error(mutations.error.message || 'Failed to update venue.');
          return;
        }
        toast.success(`Venue "${cleanName}" updated successfully.`);
      }
      onUnsavedChange();
      close();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save venue.');
    }
  };

  if (loadingVenues) {
    return <div className="p-8 text-center text-gray-500">Loading configuration...</div>;
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold text-[#001A4D]">Venue Registry</h2>
        <p className="text-sm text-gray-500 mt-1">Manage event venue registry</p>
      </div>

      {/* VENUES */}
      <div className="bg-white border border-[#E0E0E0] rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <h3 className="font-bold text-[#001A4D]">Venue Registry</h3>
            <ActiveArchivedTabs active={venueArchivedView} onChange={setVenueArchivedView} />
          </div>
          <button onClick={() => { setVenueForm({ name: '', venueType: 'inside', status: 'available' }); setModal({ type: 'add-venue' }); }}
            className="px-4 py-2 bg-[#001A4D] text-white rounded-lg text-sm font-medium hover:bg-[#001A4D]/90 flex items-center gap-2 cursor-pointer">
            <Plus className="w-4 h-4" /> Add New Venue
          </button>
        </div>
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-600">Venue</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-600">Location Type</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-600">Status</th>
              <th className="px-4 py-3 text-right text-xs font-bold text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(venueArchivedView ? archivedVenues : activeVenues).map(venue => (
              <tr key={venue.id} className="hover:bg-gray-50 transition-colors"
                onMouseEnter={() => setHoveredRow(venue.id)} onMouseLeave={() => setHoveredRow(null)}>
                <td className="px-4 py-3 text-sm font-medium text-gray-900">{venue.name}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${venue.venueType === 'outside'
                      ? 'bg-purple-100 text-purple-700 border border-purple-200'
                      : 'bg-blue-100 text-blue-700 border border-blue-200'
                    }`}>
                    {venue.venueType === 'outside' ? 'Outside (Off-Campus)' : 'Inside (Campus)'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 text-xs rounded-full font-medium capitalize ${statusPill(venue.status)}`}>{venue.status}</span>
                </td>
                <td className="px-4 py-3">
                  <div className={`flex justify-end gap-1 transition-opacity ${hoveredRow === venue.id ? 'opacity-100' : 'opacity-0'}`}>
                    {!venue.archived ? (
                      <>
                        <button onClick={() => { setVenueForm({ name: venue.name, venueType: venue.venueType || 'inside', status: venue.status }); setModal({ type: 'edit-venue', item: venue }); }} className="p-1.5 rounded hover:bg-blue-50 text-[#1E70E8] cursor-pointer"><Edit2 className="w-4 h-4" /></button>
                        <button onClick={() => setModal({ type: 'archive-venue', item: venue })} className="p-1.5 rounded hover:bg-amber-50 text-amber-500 cursor-pointer"><Archive className="w-4 h-4" /></button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => setModal({ type: 'restore-venue', item: venue })} className="p-1.5 rounded hover:bg-green-50 text-green-600 cursor-pointer"><RotateCcw className="w-4 h-4" /></button>
                        <button onClick={() => setModal({ type: 'delete-venue', item: venue })} className="p-1.5 rounded hover:bg-red-50 text-red-600 cursor-pointer"><Trash2 className="w-4 h-4" /></button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {(venueArchivedView ? archivedVenues : activeVenues).length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-400">No {venueArchivedView ? 'archived' : 'active'} venues.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* MODALS */}
      {modal.type !== 'none' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={close} />

          {/* ADD / EDIT VENUE */}
          {(modal.type === 'add-venue' || modal.type === 'edit-venue') && (
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
              <div className="bg-[#001A4D] px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h3 className="text-white font-bold text-lg">{modal.type === 'add-venue' ? 'Add New Venue' : 'Edit Venue'}</h3>
                  {modal.type === 'edit-venue' && <span className="px-2 py-0.5 bg-[#1E70E8] text-white text-xs rounded-full">Editing: {modal.item.name}</span>}
                </div>
                <button onClick={close} className="text-white/70 hover:text-white p-1.5 rounded-lg hover:bg-white/10 cursor-pointer"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Venue Name <span className="text-red-500">*</span></label>
                  <input type="text" value={venueForm.name} onChange={e => setVenueForm({ ...venueForm, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#001A4D] focus:border-transparent" placeholder="e.g. Main Auditorium or Ormoc Superdome" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Location Type <span className="text-red-500">*</span></label>
                  <div className="grid grid-cols-2 gap-3">
                    <label
                      className={`flex items-center gap-2 p-3 border rounded-xl cursor-pointer transition-all ${venueForm.venueType === 'inside'
                          ? 'border-[#001A4D] bg-blue-50/50 text-[#001A4D] font-bold shadow-2xs'
                          : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                        }`}
                    >
                      <input
                        type="radio"
                        name="venueTypeModal"
                        value="inside"
                        checked={venueForm.venueType === 'inside'}
                        onChange={() => setVenueForm({ ...venueForm, venueType: 'inside' })}
                        className="w-4 h-4 text-[#001A4D] focus:ring-[#001A4D]"
                      />
                      <span className="text-xs">Inside (Campus)</span>
                    </label>
                    <label
                      className={`flex items-center gap-2 p-3 border rounded-xl cursor-pointer transition-all ${venueForm.venueType === 'outside'
                          ? 'border-[#001A4D] bg-blue-50/50 text-[#001A4D] font-bold shadow-2xs'
                          : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                        }`}
                    >
                      <input
                        type="radio"
                        name="venueTypeModal"
                        value="outside"
                        checked={venueForm.venueType === 'outside'}
                        onChange={() => setVenueForm({ ...venueForm, venueType: 'outside' })}
                        className="w-4 h-4 text-[#001A4D] focus:ring-[#001A4D]"
                      />
                      <span className="text-xs">Outside (Off-Campus)</span>
                    </label>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Status</label>
                  <select value={venueForm.status} onChange={e => setVenueForm({ ...venueForm, status: e.target.value as VenueDocument['status'] })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#001A4D] focus:border-transparent">
                    <option value="available">Available</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="reserved">Reserved</option>
                  </select>
                </div>
                <div className="flex gap-3 pt-2">
                  <button onClick={close} className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50 cursor-pointer">Cancel</button>
                  <button onClick={saveVenue} disabled={!venueForm.name || mutations.loading}
                    className="flex-1 py-2.5 bg-gradient-to-r from-[#001A4D] to-[#0E4EBD] text-white rounded-xl text-sm font-bold disabled:opacity-40 hover:opacity-90 transition-opacity cursor-pointer">
                    {mutations.loading ? 'Saving...' : (modal.type === 'add-venue' ? 'Add New Venue' : 'Save Changes')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ARCHIVE CONFIRMS */}
          {modal.type === 'archive-venue' && (
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
              <div className="bg-gradient-to-r from-amber-500 to-amber-600 px-6 py-4 flex items-center justify-between">
                <h3 className="text-white font-bold text-lg">Archive</h3>
                <button onClick={close} className="text-white/70 hover:text-white p-1.5 rounded-lg hover:bg-white/10"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-6">
                <p className="text-sm text-gray-700 mb-4">Archive <span className="font-bold">{modal.item.name}</span>? It can be restored later.</p>
                <div className="flex gap-3">
                  <button onClick={close} className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50">Cancel</button>
                  <button onClick={async () => {
                    await mutations.archiveVenue(modal.item.id);
                    close();
                  }} disabled={mutations.loading} className="flex-1 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-bold hover:bg-amber-600 disabled:opacity-40">
                    {mutations.loading ? 'Archiving...' : 'Archive'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* RESTORE CONFIRMS */}
          {modal.type === 'restore-venue' && (
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
              <div className="bg-gradient-to-r from-green-500 to-green-600 px-6 py-4 flex items-center justify-between">
                <h3 className="text-white font-bold text-lg">Restore</h3>
                <button onClick={close} className="text-white/70 hover:text-white p-1.5 rounded-lg hover:bg-white/10"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-6">
                <p className="text-sm text-gray-700 mb-4">Restore <span className="font-bold">{modal.item.name}</span> to active?</p>
                <div className="flex gap-3">
                  <button onClick={close} className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50">Cancel</button>
                  <button onClick={async () => {
                    await mutations.restoreVenue(modal.item.id);
                    close();
                  }} disabled={mutations.loading} className="flex-1 py-2.5 bg-green-600 text-white rounded-xl text-sm font-bold hover:bg-green-700 disabled:opacity-40">
                    {mutations.loading ? 'Restoring...' : 'Restore'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* DELETE CONFIRMS */}
          {modal.type === 'delete-venue' && (
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
              <div className="bg-gradient-to-r from-red-500 to-orange-600 px-6 py-4 flex items-center justify-between">
                <h3 className="text-white font-bold text-lg">Permanently Delete</h3>
                <button onClick={close} className="text-white/70 hover:text-white p-1.5 rounded-lg hover:bg-white/10"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-6 space-y-4">
                <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">Permanently delete <span className="font-bold">{modal.item.name}</span>? This cannot be undone.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Type <span className="font-mono font-bold">DELETE</span> to confirm</label>
                  <input type="text" value={deleteText} onChange={e => setDeleteText(e.target.value)}
                    className="w-full px-3 py-2 border border-red-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 font-mono" />
                </div>
                <div className="flex gap-3">
                  <button onClick={close} className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50">Cancel</button>
                  <button onClick={async () => {
                    await mutations.deleteVenueForever(modal.item.id);
                    close();
                  }} disabled={deleteText !== 'DELETE' || mutations.loading}
                    className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700 disabled:opacity-40">
                    {mutations.loading ? 'Deleting...' : 'Delete Forever'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

