import { useState, useEffect } from 'react';
import { Users } from 'lucide-react';
import { useDepartments } from '../../../academic';
import type { EventFormData, EventSession } from '../../types/event.types';

interface Step3Props {
  data: EventFormData;
  onUpdate: (data: Partial<EventFormData>) => void;
}

const YEAR_LEVELS = ['All', '1st Year', '2nd Year', '3rd Year', '4th Year', 'G11', 'G12'];

export default function Step3Participants({ data, onUpdate }: Step3Props) {
  const { data: departments, loading: deptsLoading } = useDepartments();
  const activeDepartments = departments.filter(d => !d.archived);

  // Initialize defaults if undefined
  useEffect(() => {
    if (data.attendanceEnabled === undefined) onUpdate({ attendanceEnabled: true });
    if (data.certificatesEnabled === undefined) onUpdate({ certificatesEnabled: true });
    if (!data.targetYearLevels) onUpdate({ targetYearLevels: [] });
    if (!data.targetDepartmentIds) onUpdate({ targetDepartmentIds: [] });
  }, []);

  const updateField = (field: keyof EventFormData, value: any) => {
    onUpdate({ [field]: value });
  };

  const toggleYear = (year: string) => {
    const current = data.targetYearLevels || [];
    if (year === 'All') {
      updateField('targetYearLevels', current.length === YEAR_LEVELS.length ? [] : [...YEAR_LEVELS]);
    } else {
      updateField('targetYearLevels', current.includes(year) ? current.filter(y => y !== year) : [...current, year]);
    }
  };

  const toggleDept = (deptId: string) => {
    const current = data.targetDepartmentIds || [];
    updateField('targetDepartmentIds', current.includes(deptId) ? current.filter(id => id !== deptId) : [...current, deptId]);
  };

  const toggleHasTimeOut = (id: string) => {
    const sessions = data.sessions || [];
    updateField('sessions', sessions.map(s => s.id === id ? { ...s, hasTimeOut: !s.hasTimeOut } : s));
  };

  const updateSession = (id: string, field: keyof EventSession, value: any) => {
    const sessions = data.sessions || [];
    updateField('sessions', sessions.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const sessions = data.sessions || [];
  const selectedYears = data.targetYearLevels || [];
  const selectedDepts = data.targetDepartmentIds || [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
      <div className="space-y-6">

        {/* Section A — Target Audience */}
        <div>
          <div className="border-l-4 border-[#83358E] pl-3 mb-4">
            <h3 className="text-[#001A4D] font-bold text-base">Target Audience</h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Year Levels</label>
              <div className="flex flex-wrap gap-2">
                {YEAR_LEVELS.map((year) => (
                  <button
                    key={year}
                    onClick={() => toggleYear(year)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${selectedYears.includes(year)
                        ? 'bg-[#83358E] text-white border-[#83358E]'
                        : 'bg-white text-gray-700 border-gray-300 hover:border-[#83358E]'
                      }`}
                  >
                    {year}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Departments / Colleges</label>
              <div className="space-y-2 max-h-48 overflow-y-auto p-2 border border-gray-200 rounded-lg">
                {deptsLoading ? (
                  <div className="text-sm text-gray-500">Loading departments...</div>
                ) : activeDepartments.map((dept) => (
                  <label key={dept.id} className="flex items-center gap-2 px-3 py-2 border border-gray-100 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={selectedDepts.includes(dept.id)}
                      onChange={() => toggleDept(dept.id)}
                      className="text-[#83358E] focus:ring-[#83358E] rounded" 
                    />
                    <span className="text-sm text-gray-700">{dept.name} ({dept.code})</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Section B — Attendance Rules per Session */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="border-l-4 border-[#83358E] pl-3">
              <h3 className="text-[#001A4D] font-bold text-base">Attendance Rules</h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700">Required</span>
              <button
                onClick={() => updateField('attendanceEnabled', !data.attendanceEnabled)}
                className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${data.attendanceEnabled ? 'bg-[#83358E]' : 'bg-gray-300'}`}
              >
                <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${data.attendanceEnabled ? 'translate-x-6' : ''}`} />
              </button>
            </div>
          </div>

          {data.attendanceEnabled && (
            <>
              {/* Global rules */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Min. Attendance %</label>
                  <div className="relative">
                    <input 
                      type="number" 
                      placeholder="80" 
                      min="0" max="100"
                      value={data.minAttendancePercent || ''}
                      onChange={(e) => updateField('minAttendancePercent', e.target.value ? Number(e.target.value) : null)}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent pr-8" 
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">%</span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Late Threshold (min)</label>
                  <input 
                    type="number" 
                    placeholder="15"
                    value={data.lateThresholdMinutes || ''}
                    onChange={(e) => updateField('lateThresholdMinutes', e.target.value ? Number(e.target.value) : null)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent" 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Grace Period (min)</label>
                  <input 
                    type="number" 
                    placeholder="5"
                    value={data.gracePeriodMinutes || ''}
                    onChange={(e) => updateField('gracePeriodMinutes', e.target.value ? Number(e.target.value) : null)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent" 
                  />
                </div>
              </div>

              {/* Per-session attendance settings */}
              <div className="space-y-4">
                {sessions.map((session, index) => (
                  <div key={session.id} className="border border-gray-200 rounded-xl overflow-hidden">
                    {/* Session header */}
                    <div className="bg-[#001A4D] px-4 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-white font-bold text-sm">{session.title || `Session ${index + 1}`}</p>
                        <p className="text-white/60 text-xs">
                          {session.date || 'No Date'} · {session.startTime || 'Start'} – {session.endTime || 'End'}
                        </p>
                      </div>
                    </div>

                    {/* Time-in settings */}
                    <div className="p-4 space-y-3">
                      <div>
                        <p className="text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">Time-In Window</p>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Opens</label>
                            <input
                              type="time"
                              value={session.timeInOpen || ''}
                              onChange={(e) => updateSession(session.id, 'timeInOpen', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#83358E] focus:border-transparent"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Closes</label>
                            <input
                              type="time"
                              value={session.timeInClose || ''}
                              onChange={(e) => updateSession(session.id, 'timeInClose', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#83358E] focus:border-transparent"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Timeout toggle */}
                      <div className="flex items-center gap-2 pt-1">
                        <input
                          type="checkbox"
                          id={`timeout-${session.id}`}
                          checked={session.hasTimeOut || false}
                          onChange={() => toggleHasTimeOut(session.id)}
                          className="w-4 h-4 rounded accent-[#83358E]"
                        />
                        <label htmlFor={`timeout-${session.id}`} className="text-sm font-medium text-gray-700 cursor-pointer">
                          Enable Time-Out for this session
                        </label>
                      </div>

                      {session.hasTimeOut && (
                        <div>
                          <p className="text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">Time-Out Window</p>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">Opens</label>
                              <input
                                type="time"
                                value={session.timeOutOpen || ''}
                                onChange={(e) => updateSession(session.id, 'timeOutOpen', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#83358E] focus:border-transparent"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">Closes</label>
                              <input
                                type="time"
                                value={session.timeOutClose || ''}
                                onChange={(e) => updateSession(session.id, 'timeOutClose', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#83358E] focus:border-transparent"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Admin-only attendance scoring */}
              <div className="grid grid-cols-1 gap-4 mt-4">
                <div className="p-3 border-l-4 border-[#001A4D] bg-gray-50 rounded-lg">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Late Penalty <span className="px-2 py-0.5 bg-[#83358E] text-white text-xs rounded ml-1">Admin</span>
                  </label>
                  <div className="relative">
                    <input 
                      type="number" 
                      placeholder="50"
                      value={data.latePenaltyAmount || ''}
                      onChange={(e) => updateField('latePenaltyAmount', e.target.value ? Number(e.target.value) : null)}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent pl-8" 
                    />
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">₱</span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">Fine per late attendance (optional)</p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Section C — Certificate Rules */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="border-l-4 border-[#83358E] pl-3">
              <h3 className="text-[#001A4D] font-bold text-base">Certificate Rules</h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700">Required</span>
              <button
                onClick={() => updateField('certificatesEnabled', !data.certificatesEnabled)}
                className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${data.certificatesEnabled ? 'bg-[#83358E]' : 'bg-gray-300'}`}
              >
                <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${data.certificatesEnabled ? 'translate-x-6' : ''}`} />
              </button>
            </div>
          </div>

          {data.certificatesEnabled && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <label className="font-medium text-gray-900">Auto-Issue Certificates</label>
                    <span className="px-2 py-0.5 bg-[#83358E] text-white text-xs rounded">Admin Only</span>
                  </div>
                  <p className="text-sm text-gray-600">Certificates generated and sent automatically upon event completion</p>
                </div>
                <button
                  onClick={() => updateField('autoIssueCertificates', !data.autoIssueCertificates)}
                  className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${data.autoIssueCertificates ? 'bg-[#83358E]' : 'bg-gray-300'}`}
                >
                  <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${data.autoIssueCertificates ? 'translate-x-6' : ''}`} />
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Certificate Signatory <span className="px-2 py-0.5 bg-[#83358E] text-white text-xs rounded ml-1">Admin</span>
                </label>
                <input
                  type="text"
                  placeholder="Ms. Riselle Mae B. Lucanas, SAO Adviser"
                  value={data.certificateSignatory || ''}
                  onChange={(e) => updateField('certificateSignatory', e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Panel */}
      <div className="sticky top-0 h-fit">
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <h4 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
            <Users className="w-5 h-5 text-[#83358E]" />
            Estimated Reach
          </h4>
          <div className="space-y-4">
            <div className="p-4 bg-gradient-to-br from-[#0E4EBD] to-[#83358E] rounded-lg text-white text-center">
              <div className="text-3xl font-bold mb-1">...</div>
              <div className="text-sm opacity-90">Matching Students</div>
            </div>

            <div className="border border-gray-200 rounded-lg p-3">
              <div className="text-xs text-gray-500 mb-2">Selected Year Levels</div>
              <div className="flex flex-wrap gap-1">
                {selectedYears.length === 0
                  ? <span className="text-xs text-gray-400">None selected</span>
                  : selectedYears.map(y => (
                    <span key={y} className="px-2 py-0.5 bg-[#83358E]/10 text-[#83358E] text-xs rounded-full">{y}</span>
                  ))}
              </div>
            </div>

            <div className="border border-gray-200 rounded-lg p-3">
              <div className="text-xs text-gray-500 mb-3">By Department</div>
              <div className="space-y-2">
                {activeDepartments.filter(d => selectedDepts.includes(d.id)).map((dept) => (
                  <div key={dept.id}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-gray-700">{dept.code}</span>
                    </div>
                  </div>
                ))}
                {selectedDepts.length === 0 && <span className="text-xs text-gray-400">None selected</span>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
