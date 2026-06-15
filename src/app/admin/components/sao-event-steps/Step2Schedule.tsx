import { useState } from 'react';
import { Plus, Trash2, AlertCircle } from 'lucide-react';

interface Step2Props {
  data: any;
  onUpdate: (data: any) => void;
}

interface Session {
  id: number;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
}

export default function Step2Schedule({ data, onUpdate }: Step2Props) {
  const [overrideCapacity, setOverrideCapacity] = useState(false);
  const [reserveExclusive, setReserveExclusive] = useState(false);
  const [eventFormat, setEventFormat] = useState<'On-Campus' | 'Online' | 'Hybrid'>('On-Campus');
  const [sessions, setSessions] = useState<Session[]>([
    { id: 1, title: '', date: '', startTime: '', endTime: '' }
  ]);

  const addSession = () => {
    setSessions([...sessions, { id: Date.now(), title: '', date: '', startTime: '', endTime: '' }]);
  };

  const removeSession = (id: number) => {
    setSessions(sessions.filter(s => s.id !== id));
  };

  const updateSession = (id: number, field: keyof Session, value: string) => {
    setSessions(sessions.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  return (
    <div className="grid grid-cols-[1fr_300px] gap-6">
      <div className="space-y-6">

        {/* Section A — Academic Context */}
        <div>
          <div className="border-l-4 border-[#83358E] pl-3 mb-4">
            <h3 className="text-[#001A4D] font-bold text-base">Academic Context</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                School Year <span className="text-red-500">*</span>
              </label>
              <select className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent">
                <option>2025-2026</option>
                <option>2026-2027</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Semester <span className="text-red-500">*</span>
              </label>
              <select className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent">
                <option>First Semester</option>
                <option>Second Semester</option>
                <option>Summer</option>
              </select>
            </div>
          </div>
        </div>

        {/* Section B — Event Schedule */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="border-l-4 border-[#83358E] pl-3">
              <h3 className="text-[#001A4D] font-bold text-base">Event Schedule</h3>
            </div>
            <button
              onClick={addSession}
              className="px-4 py-2 bg-[#1E70E8] text-white rounded-lg text-sm font-medium hover:bg-[#0E4EBD] flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Add Session
            </button>
          </div>

          <div className="space-y-3">
            {sessions.map((session, index) => (
              <div key={session.id} className="p-4 border border-gray-200 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-gray-900">Session {index + 1}</h4>
                  {sessions.length > 1 && (
                    <button onClick={() => removeSession(session.id)} className="text-red-600 hover:text-red-700 p-1">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Session Title</label>
                    <input
                      type="text"
                      placeholder="e.g., Day 1 – Morning Session"
                      value={session.title}
                      onChange={(e) => updateSession(session.id, 'title', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#83358E] focus:border-transparent"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
                      <input
                        type="date"
                        value={session.date}
                        onChange={(e) => updateSession(session.id, 'date', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#83358E] focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Start Time</label>
                      <input
                        type="time"
                        value={session.startTime}
                        onChange={(e) => updateSession(session.id, 'startTime', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#83358E] focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">End Time</label>
                      <input
                        type="time"
                        value={session.endTime}
                        onChange={(e) => updateSession(session.id, 'endTime', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#83358E] focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Section C — Venue Assignment */}
        <div>
          <div className="border-l-4 border-[#83358E] pl-3 mb-4">
            <h3 className="text-[#001A4D] font-bold text-base">Venue Assignment</h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Event Format <span className="text-red-500">*</span>
              </label>
              <div className="inline-flex rounded-lg border border-gray-300 p-1">
                {(['On-Campus', 'Online', 'Hybrid'] as const).map((fmt) => (
                  <button
                    key={fmt}
                    onClick={() => setEventFormat(fmt)}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                      eventFormat === fmt ? 'bg-[#83358E] text-white' : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {fmt}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Venue <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="Enter venue name or address..."
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent"
              />
            </div>

            <div className="flex items-start gap-3 p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <label className="font-medium text-gray-900">Override Capacity Limit</label>
                  <span className="px-2 py-0.5 bg-[#83358E] text-white text-xs rounded">Admin Only</span>
                </div>
                <p className="text-sm text-gray-600">Allow exceeding venue capacity</p>
              </div>
              <button
                onClick={() => setOverrideCapacity(!overrideCapacity)}
                className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${overrideCapacity ? 'bg-[#83358E]' : 'bg-gray-300'}`}
              >
                <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${overrideCapacity ? 'translate-x-6' : ''}`} />
              </button>
            </div>

            {overrideCapacity && (
              <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-800"><strong>Warning:</strong> Overriding venue capacity. Ensure safety protocols are in place.</p>
              </div>
            )}

            <div className="flex items-start gap-3 p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <label className="font-medium text-gray-900">Reserve Venue Exclusively</label>
                  <span className="px-2 py-0.5 bg-[#83358E] text-white text-xs rounded">Admin Only</span>
                </div>
                <p className="text-sm text-gray-600">Block venue on all other proposals for selected dates</p>
              </div>
              <button
                onClick={() => setReserveExclusive(!reserveExclusive)}
                className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${reserveExclusive ? 'bg-[#83358E]' : 'bg-gray-300'}`}
              >
                <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${reserveExclusive ? 'translate-x-6' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel — Schedule Preview */}
      <div>
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm sticky top-0">
          <h4 className="font-bold text-gray-900 mb-3">Schedule Preview</h4>
          <div className="space-y-3">
            <div className="p-3 bg-gradient-to-br from-[#0E4EBD] to-[#83358E] rounded-lg text-white">
              <div className="text-xs opacity-80 mb-1">Academic Period</div>
              <div className="font-bold">SY 2025-2026 • 1st Semester</div>
            </div>

            <div className="border border-gray-200 rounded-lg p-3">
              <div className="text-xs text-gray-500 mb-2">Event Sessions</div>
              {sessions.map((session, index) => (
                <div key={session.id} className="flex items-start gap-2 py-2 border-b border-gray-100 last:border-0">
                  <div className="w-7 h-7 rounded-full bg-[#1E70E8] text-white flex items-center justify-center text-xs font-bold flex-shrink-0">{index + 1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{session.title || `Session ${index + 1}`}</div>
                    <div className="text-xs text-gray-500">{session.date || 'Date not set'}</div>
                    {(session.startTime || session.endTime) && (
                      <div className="text-xs text-gray-400">{session.startTime} – {session.endTime}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="border border-gray-200 rounded-lg p-3">
              <div className="text-xs text-gray-500 mb-1">Format</div>
              <span className={`px-2 py-1 text-xs rounded font-medium ${
                eventFormat === 'On-Campus' ? 'bg-blue-100 text-blue-700' :
                eventFormat === 'Online' ? 'bg-green-100 text-green-700' :
                'bg-purple-100 text-purple-700'
              }`}>{eventFormat}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
