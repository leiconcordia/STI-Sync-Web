import { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useSemesters } from '../../../academic';
import { useVenuesStream } from '../../hooks/useEventConfigStream';
import type { EventFormData, EventSession } from '../../types/event.types';

interface Step2Props {
  data: EventFormData;
  onUpdate: (data: Partial<EventFormData>) => void;
}

export default function Step2Schedule({ data, onUpdate }: Step2Props) {
  const { data: semesters, loading: semestersLoading } = useSemesters();
  const { venues, loading: venuesLoading } = useVenuesStream();

  const activeSemesters = semesters.filter(s => !s.archived);
  const activeVenues = venues.filter(v => !v.archived && v.status === 'available');

  // Auto-set school year when semester is selected or loaded
  useEffect(() => {
    if (data.semesterId && !data.schoolYear) {
      const sem = semesters.find(s => s.id === data.semesterId);
      if (sem) {
        onUpdate({ schoolYear: sem.academicYear });
      }
    } else if (!data.semesterId && activeSemesters.length > 0) {
      // Auto-select ACTIVE semester by default if available
      const activeSem = activeSemesters.find(s => s.status === 'ACTIVE');
      if (activeSem) {
        onUpdate({ semesterId: activeSem.id, schoolYear: activeSem.academicYear });
      }
    }
  }, [semesters, data.semesterId, data.schoolYear]);

  const sessions = data.sessions || [
    { id: Date.now().toString(), title: '', date: '', startTime: '', endTime: '', timeInOpen: '', timeInClose: '', hasTimeOut: false, timeOutOpen: '', timeOutClose: '' }
  ];

  const updateField = (field: keyof EventFormData, value: any) => {
    onUpdate({ [field]: value });
  };

  const addSession = () => {
    const newSession: EventSession = { id: Date.now().toString(), title: '', date: '', startTime: '', endTime: '', timeInOpen: '', timeInClose: '', hasTimeOut: false, timeOutOpen: '', timeOutClose: '' };
    updateField('sessions', [...sessions, newSession]);
  };

  const removeSession = (id: string) => {
    updateField('sessions', sessions.filter(s => s.id !== id));
  };

  const updateSession = (id: string, field: keyof EventSession, value: any) => {
    updateField('sessions', sessions.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const selectedSemester = activeSemesters.find(s => s.id === data.semesterId);
  const selectedVenue = activeVenues.find(v => v.id === data.venueId);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
      {/* Left Column */}
      <div className="space-y-6">
        {/* Section A — Academic Context */}
        <div>
          <div className="border-l-4 border-[#83358E] pl-3 mb-4">
            <h3 className="text-[#001A4D] font-bold text-base">Academic Context</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Semester <span className="text-red-500">*</span>
              </label>
              <select 
                value={data.semesterId || ''}
                onChange={(e) => {
                  const sem = activeSemesters.find(s => s.id === e.target.value);
                  updateField('semesterId', e.target.value);
                  if (sem) updateField('schoolYear', sem.academicYear);
                }}
                disabled={semestersLoading}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent disabled:opacity-50"
              >
                <option value="">{semestersLoading ? 'Loading...' : 'Select Semester...'}</option>
                {activeSemesters.map(sem => (
                  <option key={sem.id} value={sem.id}>{sem.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                School Year
              </label>
              <input 
                type="text" 
                value={data.schoolYear || ''}
                disabled
                placeholder="Auto-generated"
                className="w-full px-4 py-2.5 border border-gray-300 bg-gray-100 text-gray-600 rounded-lg" 
              />
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
                  <input
                    type="text"
                    placeholder="Session Title"
                    value={session.title}
                    onChange={(e) => updateSession(session.id, 'title', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                  <div className="grid grid-cols-3 gap-3">
                    <input type="date" value={session.date} onChange={(e) => updateSession(session.id, 'date', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                    <input type="time" value={session.startTime} onChange={(e) => updateSession(session.id, 'startTime', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                    <input type="time" value={session.endTime} onChange={(e) => updateSession(session.id, 'endTime', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Event Format <span className="text-red-500">*</span>
              </label>
              <select
                value={data.eventFormat || 'On-Campus'}
                onChange={(e) => updateField('eventFormat', e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent"
              >
                <option value="On-Campus">On-Campus</option>
                <option value="Online">Online</option>
                <option value="Hybrid">Hybrid</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Venue <span className="text-red-500">*</span>
              </label>
              <select
                value={data.venueId || ''}
                onChange={(e) => updateField('venueId', e.target.value)}
                disabled={venuesLoading}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent disabled:opacity-50"
              >
                <option value="">{venuesLoading ? 'Loading venues...' : 'Select venue...'}</option>
                {activeVenues.map(v => (
                  <option key={v.id} value={v.id}>{v.name} (Cap: {v.capacity})</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Right Column */}
      <div className="sticky top-0 h-fit">
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <h4 className="font-bold text-gray-900 mb-3">Schedule Preview</h4>
          <div className="space-y-3">
            <div className="p-3 bg-gradient-to-br from-[#0E4EBD] to-[#83358E] rounded-lg text-white">
              <div className="text-xs opacity-80 mb-1">Academic Period</div>
              <div className="font-bold">{selectedSemester ? selectedSemester.label : 'Select Semester'}</div>
            </div>
            
            <div className="border border-gray-200 rounded-lg p-3">
              <div className="text-xs text-gray-500 mb-2">Event Sessions</div>
              {sessions.map((session, index) => (
                <div key={session.id} className="py-2 border-b border-gray-100 last:border-0">
                  <div className="text-sm font-medium">{session.title || `Session ${index + 1}`}</div>
                  <div className="text-xs text-gray-500">{session.date || 'Date not set'} {session.startTime ? `• ${session.startTime}` : ''}</div>
                </div>
              ))}
            </div>

            <div className="border border-gray-200 rounded-lg p-3">
              <div className="text-xs text-gray-500 mb-2">Venue</div>
              <div className="text-sm font-medium">{selectedVenue ? selectedVenue.name : 'Venue not selected'}</div>
              <div className="text-xs text-gray-500">{data.eventFormat || 'On-Campus'}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}