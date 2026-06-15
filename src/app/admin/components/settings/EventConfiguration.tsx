import { useState } from 'react';
import { Plus, Archive, RotateCcw, Trash2, Edit2, X, AlertTriangle } from 'lucide-react';

interface EventConfigurationProps {
  onUnsavedChange: () => void;
}

interface EventType {
  id: string;
  name: string;
  color: string;
  requiresSpecialApproval: boolean;
  defaultAttendanceRule: string;
  archived: boolean;
}

interface EventCategory {
  id: string;
  name: string;
  typeId: string;
  archived: boolean;
}

interface Venue {
  id: string;
  name: string;
  capacity: number;
  facilities: string[];
  status: 'available' | 'maintenance' | 'reserved';
  archived: boolean;
}

type SubTab = 'types' | 'categories' | 'venues';

type ModalState =
  | { type: 'none' }
  | { type: 'add-type' }
  | { type: 'edit-type'; item: EventType }
  | { type: 'archive-type'; item: EventType }
  | { type: 'restore-type'; item: EventType }
  | { type: 'delete-type'; item: EventType }
  | { type: 'add-cat' }
  | { type: 'edit-cat'; item: EventCategory }
  | { type: 'archive-cat'; item: EventCategory }
  | { type: 'restore-cat'; item: EventCategory }
  | { type: 'delete-cat'; item: EventCategory }
  | { type: 'add-venue' }
  | { type: 'edit-venue'; item: Venue }
  | { type: 'archive-venue'; item: Venue }
  | { type: 'restore-venue'; item: Venue }
  | { type: 'delete-venue'; item: Venue };

const COLORS = ['#001A4D', '#1E70E8', '#83358E', '#22C55E', '#FFC107', '#EF4444', '#F97316', '#0EA5E9'];
const ATTENDANCE_RULES = ['QR Scan In Only', 'QR Scan In + Out', 'Manual Entry', 'Auto-mark All'];
const FACILITY_OPTIONS = ['Projector', 'Sound System', 'Air Conditioning', 'Stage', 'Whiteboard', 'Podium', 'Lighting', 'Tables & Chairs'];

const INIT_TYPES: EventType[] = [
  { id: 't1', name: 'Academic', color: '#1E70E8', requiresSpecialApproval: false, defaultAttendanceRule: 'QR Scan In Only', archived: false },
  { id: 't2', name: 'Social', color: '#22C55E', requiresSpecialApproval: false, defaultAttendanceRule: 'QR Scan In + Out', archived: false },
  { id: 't3', name: 'Cultural', color: '#FFC107', requiresSpecialApproval: true, defaultAttendanceRule: 'QR Scan In + Out', archived: false },
  { id: 't4', name: 'Fundraising', color: '#83358E', requiresSpecialApproval: true, defaultAttendanceRule: 'Manual Entry', archived: false },
];

const INIT_CATS: EventCategory[] = [
  { id: 'c1', name: 'Seminar / Webinar', typeId: 't1', archived: false },
  { id: 'c2', name: 'Competition', typeId: 't1', archived: false },
  { id: 'c3', name: 'Party / Celebration', typeId: 't2', archived: false },
  { id: 'c4', name: 'Cultural Night', typeId: 't3', archived: false },
];

const INIT_VENUES: Venue[] = [
  { id: 'v1', name: 'Main Auditorium', capacity: 500, facilities: ['Projector', 'Sound System', 'Air Conditioning', 'Stage', 'Lighting'], status: 'available', archived: false },
  { id: 'v2', name: 'Conference Room A', capacity: 40, facilities: ['Projector', 'Air Conditioning', 'Whiteboard'], status: 'available', archived: false },
  { id: 'v3', name: 'Gymnasium', capacity: 800, facilities: ['Sound System', 'Stage', 'Lighting'], status: 'maintenance', archived: false },
];

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
  const [subTab, setSubTab] = useState<SubTab>('types');
  const [eventTypes, setEventTypes] = useState<EventType[]>(INIT_TYPES);
  const [categories, setCategories] = useState<EventCategory[]>(INIT_CATS);
  const [venues, setVenues] = useState<Venue[]>(INIT_VENUES);

  const [typeArchivedView, setTypeArchivedView] = useState(false);
  const [catArchivedView, setCatArchivedView] = useState(false);
  const [venueArchivedView, setVenueArchivedView] = useState(false);

  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>({ type: 'none' });
  const [deleteText, setDeleteText] = useState('');

  const [typeForm, setTypeForm] = useState({ name: '', color: '#1E70E8', requiresSpecialApproval: false, defaultAttendanceRule: 'QR Scan In Only' });
  const [catForm, setCatForm] = useState({ name: '', typeId: '' });
  const [venueForm, setVenueForm] = useState({ name: '', capacity: 50, facilities: [] as string[], status: 'available' as Venue['status'] });

  const close = () => { setModal({ type: 'none' }); setDeleteText(''); };
  const change = () => onUnsavedChange();

  const activeTypes = eventTypes.filter(t => !t.archived);
  const archivedTypes = eventTypes.filter(t => t.archived);
  const activeCats = categories.filter(c => !c.archived);
  const archivedCats = categories.filter(c => c.archived);
  const activeVenues = venues.filter(v => !v.archived);
  const archivedVenues = venues.filter(v => v.archived);

  const getTypeName = (id: string) => eventTypes.find(t => t.id === id)?.name ?? '—';
  const getTypeColor = (id: string) => eventTypes.find(t => t.id === id)?.color ?? '#ccc';

  const statusPill = (s: Venue['status']) =>
    s === 'available' ? 'bg-green-100 text-green-700' :
    s === 'maintenance' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700';

  const toggleFacility = (f: string) =>
    setVenueForm(p => ({ ...p, facilities: p.facilities.includes(f) ? p.facilities.filter(x => x !== f) : [...p.facilities, f] }));

  const saveType = () => {
    if (modal.type === 'add-type') setEventTypes([...eventTypes, { id: `t${Date.now()}`, ...typeForm, archived: false }]);
    else if (modal.type === 'edit-type') setEventTypes(eventTypes.map(t => t.id === modal.item.id ? { ...t, ...typeForm } : t));
    change(); close();
  };
  const saveCat = () => {
    if (modal.type === 'add-cat') setCategories([...categories, { id: `c${Date.now()}`, ...catForm, archived: false }]);
    else if (modal.type === 'edit-cat') setCategories(categories.map(c => c.id === modal.item.id ? { ...c, ...catForm } : c));
    change(); close();
  };
  const saveVenue = () => {
    if (modal.type === 'add-venue') setVenues([...venues, { id: `v${Date.now()}`, ...venueForm, archived: false }]);
    else if (modal.type === 'edit-venue') setVenues(venues.map(v => v.id === modal.item.id ? { ...v, ...venueForm } : v));
    change(); close();
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold text-[#001A4D]">Event Configuration</h2>
        <p className="text-sm text-gray-500 mt-1">Manage event types, categories, and venue registry</p>
      </div>

      <div className="flex items-center gap-2 border-b border-gray-200">
        {([['types', 'Event Types'], ['categories', 'Event Categories'], ['venues', 'Venue Registry']] as [SubTab, string][]).map(([tab, label]) => (
          <button key={tab} onClick={() => setSubTab(tab)}
            className={`px-5 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-px ${subTab === tab ? 'border-[#001A4D] text-[#001A4D]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* EVENT TYPES */}
      {subTab === 'types' && (
        <div className="bg-white border border-[#E0E0E0] rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <h3 className="font-bold text-[#001A4D]">Event Types</h3>
              <ActiveArchivedTabs active={typeArchivedView} onChange={setTypeArchivedView} />
            </div>
            <button onClick={() => { setTypeForm({ name: '', color: '#1E70E8', requiresSpecialApproval: false, defaultAttendanceRule: 'QR Scan In Only' }); setModal({ type: 'add-type' }); }}
              className="px-4 py-2 bg-[#001A4D] text-white rounded-lg text-sm font-medium hover:bg-[#001A4D]/90 flex items-center gap-2">
              <Plus className="w-4 h-4" /> Add Type
            </button>
          </div>
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-600">Type</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-600">Color</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-600">Special Approval</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-600">Attendance Rule</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(typeArchivedView ? archivedTypes : activeTypes).map(et => (
                <tr key={et.id} className="hover:bg-gray-50 transition-colors"
                  onMouseEnter={() => setHoveredRow(et.id)} onMouseLeave={() => setHoveredRow(null)}>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{et.name}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full border border-gray-200" style={{ backgroundColor: et.color }} />
                      <span className="text-xs font-mono text-gray-500">{et.color}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${et.requiresSpecialApproval ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
                      {et.requiresSpecialApproval ? 'Required' : 'Standard'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{et.defaultAttendanceRule}</td>
                  <td className="px-4 py-3">
                    <div className={`flex justify-end gap-1 transition-opacity ${hoveredRow === et.id ? 'opacity-100' : 'opacity-0'}`}>
                      {!et.archived ? (
                        <>
                          <button onClick={() => { setTypeForm({ name: et.name, color: et.color, requiresSpecialApproval: et.requiresSpecialApproval, defaultAttendanceRule: et.defaultAttendanceRule }); setModal({ type: 'edit-type', item: et }); }} className="p-1.5 rounded hover:bg-blue-50 text-[#1E70E8]"><Edit2 className="w-4 h-4" /></button>
                          <button onClick={() => setModal({ type: 'archive-type', item: et })} className="p-1.5 rounded hover:bg-amber-50 text-amber-500"><Archive className="w-4 h-4" /></button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => setModal({ type: 'restore-type', item: et })} className="p-1.5 rounded hover:bg-green-50 text-green-600"><RotateCcw className="w-4 h-4" /></button>
                          <button onClick={() => setModal({ type: 'delete-type', item: et })} className="p-1.5 rounded hover:bg-red-50 text-red-600"><Trash2 className="w-4 h-4" /></button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {(typeArchivedView ? archivedTypes : activeTypes).length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">No {typeArchivedView ? 'archived' : 'active'} event types.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* CATEGORIES */}
      {subTab === 'categories' && (
        <div className="bg-white border border-[#E0E0E0] rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <h3 className="font-bold text-[#001A4D]">Event Categories</h3>
              <ActiveArchivedTabs active={catArchivedView} onChange={setCatArchivedView} />
            </div>
            <button onClick={() => { setCatForm({ name: '', typeId: '' }); setModal({ type: 'add-cat' }); }}
              className="px-4 py-2 bg-[#001A4D] text-white rounded-lg text-sm font-medium hover:bg-[#001A4D]/90 flex items-center gap-2">
              <Plus className="w-4 h-4" /> Add Category
            </button>
          </div>
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-600">Category Name</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-600">Event Type</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(catArchivedView ? archivedCats : activeCats).map(cat => (
                <tr key={cat.id} className="hover:bg-gray-50 transition-colors"
                  onMouseEnter={() => setHoveredRow(cat.id)} onMouseLeave={() => setHoveredRow(null)}>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{cat.name}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-sm text-gray-600">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: getTypeColor(cat.typeId) }} />
                      {getTypeName(cat.typeId)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className={`flex justify-end gap-1 transition-opacity ${hoveredRow === cat.id ? 'opacity-100' : 'opacity-0'}`}>
                      {!cat.archived ? (
                        <>
                          <button onClick={() => { setCatForm({ name: cat.name, typeId: cat.typeId }); setModal({ type: 'edit-cat', item: cat }); }} className="p-1.5 rounded hover:bg-blue-50 text-[#1E70E8]"><Edit2 className="w-4 h-4" /></button>
                          <button onClick={() => setModal({ type: 'archive-cat', item: cat })} className="p-1.5 rounded hover:bg-amber-50 text-amber-500"><Archive className="w-4 h-4" /></button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => setModal({ type: 'restore-cat', item: cat })} className="p-1.5 rounded hover:bg-green-50 text-green-600"><RotateCcw className="w-4 h-4" /></button>
                          <button onClick={() => setModal({ type: 'delete-cat', item: cat })} className="p-1.5 rounded hover:bg-red-50 text-red-600"><Trash2 className="w-4 h-4" /></button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {(catArchivedView ? archivedCats : activeCats).length === 0 && (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-sm text-gray-400">No {catArchivedView ? 'archived' : 'active'} categories.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* VENUES */}
      {subTab === 'venues' && (
        <div className="bg-white border border-[#E0E0E0] rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <h3 className="font-bold text-[#001A4D]">Venue Registry</h3>
              <ActiveArchivedTabs active={venueArchivedView} onChange={setVenueArchivedView} />
            </div>
            <button onClick={() => { setVenueForm({ name: '', capacity: 50, facilities: [], status: 'available' }); setModal({ type: 'add-venue' }); }}
              className="px-4 py-2 bg-[#001A4D] text-white rounded-lg text-sm font-medium hover:bg-[#001A4D]/90 flex items-center gap-2">
              <Plus className="w-4 h-4" /> Add Venue
            </button>
          </div>
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-600">Venue</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-600">Capacity</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-600">Facilities</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-600">Status</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(venueArchivedView ? archivedVenues : activeVenues).map(venue => (
                <tr key={venue.id} className="hover:bg-gray-50 transition-colors"
                  onMouseEnter={() => setHoveredRow(venue.id)} onMouseLeave={() => setHoveredRow(null)}>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{venue.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{venue.capacity.toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {venue.facilities.slice(0, 3).map(f => <span key={f} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">{f}</span>)}
                      {venue.facilities.length > 3 && <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 text-xs rounded">+{venue.facilities.length - 3}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 text-xs rounded-full font-medium capitalize ${statusPill(venue.status)}`}>{venue.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className={`flex justify-end gap-1 transition-opacity ${hoveredRow === venue.id ? 'opacity-100' : 'opacity-0'}`}>
                      {!venue.archived ? (
                        <>
                          <button onClick={() => { setVenueForm({ name: venue.name, capacity: venue.capacity, facilities: [...venue.facilities], status: venue.status }); setModal({ type: 'edit-venue', item: venue }); }} className="p-1.5 rounded hover:bg-blue-50 text-[#1E70E8]"><Edit2 className="w-4 h-4" /></button>
                          <button onClick={() => setModal({ type: 'archive-venue', item: venue })} className="p-1.5 rounded hover:bg-amber-50 text-amber-500"><Archive className="w-4 h-4" /></button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => setModal({ type: 'restore-venue', item: venue })} className="p-1.5 rounded hover:bg-green-50 text-green-600"><RotateCcw className="w-4 h-4" /></button>
                          <button onClick={() => setModal({ type: 'delete-venue', item: venue })} className="p-1.5 rounded hover:bg-red-50 text-red-600"><Trash2 className="w-4 h-4" /></button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {(venueArchivedView ? archivedVenues : activeVenues).length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">No {venueArchivedView ? 'archived' : 'active'} venues.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* MODALS */}
      {modal.type !== 'none' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={close} />

          {/* ADD / EDIT TYPE */}
          {(modal.type === 'add-type' || modal.type === 'edit-type') && (
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
              <div className="bg-[#001A4D] px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h3 className="text-white font-bold text-lg">{modal.type === 'add-type' ? 'Add Event Type' : 'Edit Event Type'}</h3>
                  {modal.type === 'edit-type' && <span className="px-2 py-0.5 bg-[#1E70E8] text-white text-xs rounded-full">Editing: {modal.item.name}</span>}
                </div>
                <button onClick={close} className="text-white/70 hover:text-white p-1.5 rounded-lg hover:bg-white/10"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Type Name <span className="text-red-500">*</span></label>
                  <input type="text" value={typeForm.name} onChange={e => setTypeForm({ ...typeForm, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#001A4D] focus:border-transparent" placeholder="e.g. Academic" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Color</label>
                  <div className="flex flex-wrap gap-2">
                    {COLORS.map(c => (
                      <button key={c} onClick={() => setTypeForm({ ...typeForm, color: c })}
                        className={`w-8 h-8 rounded-full border-2 transition-all ${typeForm.color === c ? 'border-gray-900 scale-110' : 'border-transparent'}`}
                        style={{ backgroundColor: c }} />
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Default Attendance Rule</label>
                  <select value={typeForm.defaultAttendanceRule} onChange={e => setTypeForm({ ...typeForm, defaultAttendanceRule: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#001A4D] focus:border-transparent">
                    {ATTENDANCE_RULES.map(r => <option key={r}>{r}</option>)}
                  </select>
                </div>
                <label className="flex items-center justify-between p-3 border border-gray-200 rounded-lg cursor-pointer">
                  <span className="text-sm text-gray-700">Requires Special Approval</span>
                  <button onClick={() => setTypeForm({ ...typeForm, requiresSpecialApproval: !typeForm.requiresSpecialApproval })}
                    className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${typeForm.requiresSpecialApproval ? 'bg-[#001A4D]' : 'bg-gray-300'}`}>
                    <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${typeForm.requiresSpecialApproval ? 'translate-x-5' : ''}`} />
                  </button>
                </label>
                <div className="flex gap-3 pt-2">
                  <button onClick={close} className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50">Cancel</button>
                  <button onClick={saveType} disabled={!typeForm.name}
                    className={`flex-1 py-2.5 text-white rounded-xl text-sm font-bold disabled:opacity-40 ${modal.type === 'edit-type' ? 'bg-[#83358E] hover:bg-[#6D2A78]' : 'bg-[#001A4D] hover:bg-[#001A4D]/90'}`}>
                    {modal.type === 'add-type' ? 'Save' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ADD / EDIT CATEGORY */}
          {(modal.type === 'add-cat' || modal.type === 'edit-cat') && (
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
              <div className="bg-[#001A4D] px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h3 className="text-white font-bold text-lg">{modal.type === 'add-cat' ? 'Add Category' : 'Edit Category'}</h3>
                  {modal.type === 'edit-cat' && <span className="px-2 py-0.5 bg-[#1E70E8] text-white text-xs rounded-full">Editing: {modal.item.name}</span>}
                </div>
                <button onClick={close} className="text-white/70 hover:text-white p-1.5 rounded-lg hover:bg-white/10"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Category Name <span className="text-red-500">*</span></label>
                  <input type="text" value={catForm.name} onChange={e => setCatForm({ ...catForm, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#001A4D] focus:border-transparent" placeholder="e.g. Seminar / Webinar" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {modal.type === 'edit-cat' ? 'Event Type (read-only)' : 'Event Type'} <span className="text-red-500">*</span>
                  </label>
                  {modal.type === 'edit-cat' ? (
                    <input type="text" readOnly value={getTypeName(modal.item.typeId)}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-500" />
                  ) : (
                    <select value={catForm.typeId} onChange={e => setCatForm({ ...catForm, typeId: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#001A4D] focus:border-transparent">
                      <option value="">Select type...</option>
                      {activeTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  )}
                </div>
                <div className="flex gap-3 pt-2">
                  <button onClick={close} className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50">Cancel</button>
                  <button onClick={saveCat} disabled={!catForm.name || (!catForm.typeId && modal.type === 'add-cat')}
                    className={`flex-1 py-2.5 text-white rounded-xl text-sm font-bold disabled:opacity-40 ${modal.type === 'edit-cat' ? 'bg-[#83358E] hover:bg-[#6D2A78]' : 'bg-[#001A4D] hover:bg-[#001A4D]/90'}`}>
                    {modal.type === 'add-cat' ? 'Save' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ADD / EDIT VENUE */}
          {(modal.type === 'add-venue' || modal.type === 'edit-venue') && (
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
              <div className="bg-[#001A4D] px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h3 className="text-white font-bold text-lg">{modal.type === 'add-venue' ? 'Add Venue' : 'Edit Venue'}</h3>
                  {modal.type === 'edit-venue' && <span className="px-2 py-0.5 bg-[#1E70E8] text-white text-xs rounded-full">Editing: {modal.item.name}</span>}
                </div>
                <button onClick={close} className="text-white/70 hover:text-white p-1.5 rounded-lg hover:bg-white/10"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Venue Name <span className="text-red-500">*</span></label>
                  <input type="text" value={venueForm.name} onChange={e => setVenueForm({ ...venueForm, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#001A4D] focus:border-transparent" placeholder="e.g. Main Auditorium" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Capacity <span className="text-red-500">*</span></label>
                    <input type="number" value={venueForm.capacity} onChange={e => setVenueForm({ ...venueForm, capacity: Number(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#001A4D] focus:border-transparent" min={1} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Status</label>
                    <select value={venueForm.status} onChange={e => setVenueForm({ ...venueForm, status: e.target.value as Venue['status'] })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#001A4D] focus:border-transparent">
                      <option value="available">Available</option>
                      <option value="maintenance">Maintenance</option>
                      <option value="reserved">Reserved</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Facilities</label>
                  <div className="flex flex-wrap gap-2">
                    {FACILITY_OPTIONS.map(f => (
                      <button key={f} onClick={() => toggleFacility(f)}
                        className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${venueForm.facilities.includes(f) ? 'bg-[#001A4D] text-white border-[#001A4D]' : 'bg-white text-gray-600 border-gray-300 hover:border-[#001A4D]'}`}>
                        {f}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-3 pt-2">
                  <button onClick={close} className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50">Cancel</button>
                  <button onClick={saveVenue} disabled={!venueForm.name}
                    className={`flex-1 py-2.5 text-white rounded-xl text-sm font-bold disabled:opacity-40 ${modal.type === 'edit-venue' ? 'bg-[#83358E] hover:bg-[#6D2A78]' : 'bg-[#001A4D] hover:bg-[#001A4D]/90'}`}>
                    {modal.type === 'add-venue' ? 'Save' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ARCHIVE CONFIRMS (shared) */}
          {(modal.type === 'archive-type' || modal.type === 'archive-cat' || modal.type === 'archive-venue') && (
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
              <div className="bg-gradient-to-r from-amber-500 to-amber-600 px-6 py-4 flex items-center justify-between">
                <h3 className="text-white font-bold text-lg">Archive</h3>
                <button onClick={close} className="text-white/70 hover:text-white p-1.5 rounded-lg hover:bg-white/10"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-6">
                <p className="text-sm text-gray-700 mb-4">Archive <span className="font-bold">{modal.item.name}</span>? It can be restored later.</p>
                <div className="flex gap-3">
                  <button onClick={close} className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50">Cancel</button>
                  <button onClick={() => {
                    if (modal.type === 'archive-type') setEventTypes(eventTypes.map(t => t.id === modal.item.id ? { ...t, archived: true } : t));
                    else if (modal.type === 'archive-cat') setCategories(categories.map(c => c.id === modal.item.id ? { ...c, archived: true } : c));
                    else if (modal.type === 'archive-venue') setVenues(venues.map(v => v.id === modal.item.id ? { ...v, archived: true } : v));
                    change(); close();
                  }} className="flex-1 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-bold hover:bg-amber-600">Archive</button>
                </div>
              </div>
            </div>
          )}

          {/* RESTORE CONFIRMS */}
          {(modal.type === 'restore-type' || modal.type === 'restore-cat' || modal.type === 'restore-venue') && (
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
              <div className="bg-gradient-to-r from-green-500 to-green-600 px-6 py-4 flex items-center justify-between">
                <h3 className="text-white font-bold text-lg">Restore</h3>
                <button onClick={close} className="text-white/70 hover:text-white p-1.5 rounded-lg hover:bg-white/10"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-6">
                <p className="text-sm text-gray-700 mb-4">Restore <span className="font-bold">{modal.item.name}</span> to active?</p>
                <div className="flex gap-3">
                  <button onClick={close} className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50">Cancel</button>
                  <button onClick={() => {
                    if (modal.type === 'restore-type') setEventTypes(eventTypes.map(t => t.id === modal.item.id ? { ...t, archived: false } : t));
                    else if (modal.type === 'restore-cat') setCategories(categories.map(c => c.id === modal.item.id ? { ...c, archived: false } : c));
                    else if (modal.type === 'restore-venue') setVenues(venues.map(v => v.id === modal.item.id ? { ...v, archived: false } : v));
                    change(); close();
                  }} className="flex-1 py-2.5 bg-green-600 text-white rounded-xl text-sm font-bold hover:bg-green-700">Restore</button>
                </div>
              </div>
            </div>
          )}

          {/* DELETE CONFIRMS */}
          {(modal.type === 'delete-type' || modal.type === 'delete-cat' || modal.type === 'delete-venue') && (
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
                  <button onClick={() => {
                    if (modal.type === 'delete-type') setEventTypes(eventTypes.filter(t => t.id !== modal.item.id));
                    else if (modal.type === 'delete-cat') setCategories(categories.filter(c => c.id !== modal.item.id));
                    else if (modal.type === 'delete-venue') setVenues(venues.filter(v => v.id !== modal.item.id));
                    change(); close();
                  }} disabled={deleteText !== 'DELETE'}
                    className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700 disabled:opacity-40">Delete Forever</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
