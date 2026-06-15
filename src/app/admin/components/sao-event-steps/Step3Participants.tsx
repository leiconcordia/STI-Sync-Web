import { useState } from 'react';
import { Users } from 'lucide-react';

interface Step3Props {
  data: any;
  onUpdate: (data: any) => void;
}

interface SessionAttendance {
  id: number;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  timeInOpen: string;
  timeInClose: string;
  hasTimeOut: boolean;
  timeOutOpen: string;
  timeOutClose: string;
}

const EXAMPLE_SESSIONS: SessionAttendance[] = [
  { id: 1, title: 'Day 1 – Morning Session', date: '2026-02-10', startTime: '08:00', endTime: '12:00', timeInOpen: '07:30', timeInClose: '09:00', hasTimeOut: true, timeOutOpen: '11:30', timeOutClose: '12:30' },
  { id: 2, title: 'Day 1 – Afternoon Session', date: '2026-02-10', startTime: '13:00', endTime: '17:00', timeInOpen: '12:45', timeInClose: '14:00', hasTimeOut: false, timeOutOpen: '', timeOutClose: '' },
];

const YEAR_LEVELS = ['All', '1st Year', '2nd Year', '3rd Year', '4th Year', 'G11', 'G12'];
const DEPARTMENTS = [
  'College of Computer Studies (CCS)',
  'College of Business Administration (CBA)',
  'College of Arts and Sciences (CAS)',
  'College of Teacher Education (CTE)',
];

export default function Step3Participants({ data, onUpdate }: Step3Props) {
  const [selectedYears, setSelectedYears] = useState<string[]>([]);
  const [sessions, setSessions] = useState<SessionAttendance[]>(EXAMPLE_SESSIONS);
  const [autoIssueCerts, setAutoIssueCerts] = useState(false);

  const toggleYear = (year: string) => {
    if (year === 'All') {
      setSelectedYears(selectedYears.length === YEAR_LEVELS.length ? [] : [...YEAR_LEVELS]);
    } else {
      setSelectedYears(prev => prev.includes(year) ? prev.filter(y => y !== year) : [...prev, year]);
    }
  };

  const toggleHasTimeOut = (id: number) => {
    setSessions(sessions.map(s => s.id === id ? { ...s, hasTimeOut: !s.hasTimeOut } : s));
  };

  const updateSession = (id: number, field: keyof SessionAttendance, value: any) => {
    setSessions(sessions.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  return (
    <div className="grid grid-cols-[1fr_300px] gap-6">
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
                    className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                      selectedYears.includes(year)
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
              <div className="space-y-2">
                {DEPARTMENTS.map((dept) => (
                  <label key={dept} className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input type="checkbox" className="text-[#83358E] focus:ring-[#83358E] rounded" />
                    <span className="text-sm text-gray-700">{dept}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Section B — Attendance Rules per Session */}
        <div>
          <div className="border-l-4 border-[#83358E] pl-3 mb-4">
            <h3 className="text-[#001A4D] font-bold text-base">Attendance Rules</h3>
          </div>

          {/* Global rules */}
          <div className="grid grid-cols-3 gap-4 mb-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Min. Attendance %</label>
              <div className="relative">
                <input type="number" placeholder="80" min="0" max="100"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent pr-8" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">%</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Late Threshold (min)</label>
              <input type="number" placeholder="15"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Grace Period (min)</label>
              <input type="number" placeholder="5"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent" />
            </div>
          </div>

          {/* Per-session attendance settings */}
          <div className="space-y-4">
            {sessions.map((session) => (
              <div key={session.id} className="border border-gray-200 rounded-xl overflow-hidden">
                {/* Session header */}
                <div className="bg-[#001A4D] px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-white font-bold text-sm">{session.title}</p>
                    <p className="text-white/60 text-xs">
                      {session.date} · {session.startTime} – {session.endTime}
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
                          value={session.timeInOpen}
                          onChange={(e) => updateSession(session.id, 'timeInOpen', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#83358E] focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Closes</label>
                        <input
                          type="time"
                          value={session.timeInClose}
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
                      checked={session.hasTimeOut}
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
                            value={session.timeOutOpen}
                            onChange={(e) => updateSession(session.id, 'timeOutOpen', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#83358E] focus:border-transparent"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Closes</label>
                          <input
                            type="time"
                            value={session.timeOutClose}
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
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div className="p-3 border-l-4 border-[#001A4D] bg-gray-50 rounded-lg">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Attendance Weight <span className="px-2 py-0.5 bg-[#83358E] text-white text-xs rounded ml-1">Admin</span>
              </label>
              <div className="relative">
                <input type="number" placeholder="5" min="0" max="100"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent pr-8" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">%</span>
              </div>
              <p className="text-xs text-gray-600 mt-1">Weight in organizational compliance score</p>
            </div>
            <div className="p-3 border-l-4 border-[#001A4D] bg-gray-50 rounded-lg">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Absence Penalty <span className="px-2 py-0.5 bg-[#83358E] text-white text-xs rounded ml-1">Admin</span>
              </label>
              <div className="relative">
                <input type="number" placeholder="50"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent pl-8" />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">₱</span>
              </div>
              <p className="text-xs text-gray-600 mt-1">Fine per unexcused absence (mandatory events)</p>
            </div>
          </div>
        </div>

        {/* Section C — Certificate Rules */}
        <div>
          <div className="border-l-4 border-[#83358E] pl-3 mb-4">
            <h3 className="text-[#001A4D] font-bold text-base">Certificate Rules</h3>
          </div>
          <div className="space-y-4">
            <label className="flex items-center gap-2 px-4 py-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
              <input type="checkbox" className="text-[#83358E] focus:ring-[#83358E] rounded" />
              <div className="flex-1">
                <div className="font-medium text-gray-900 text-sm">Issue Certificates of Participation</div>
                <div className="text-xs text-gray-600">Generate certificates for qualified participants</div>
              </div>
            </label>

            <div className="flex items-start gap-3 p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <label className="font-medium text-gray-900">Auto-Issue Certificates</label>
                  <span className="px-2 py-0.5 bg-[#83358E] text-white text-xs rounded">Admin Only</span>
                </div>
                <p className="text-sm text-gray-600">Certificates generated and sent automatically upon event completion</p>
              </div>
              <button
                onClick={() => setAutoIssueCerts(!autoIssueCerts)}
                className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${autoIssueCerts ? 'bg-[#83358E]' : 'bg-gray-300'}`}
              >
                <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${autoIssueCerts ? 'translate-x-6' : ''}`} />
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Certificate Signatory <span className="px-2 py-0.5 bg-[#83358E] text-white text-xs rounded ml-1">Admin</span>
              </label>
              <input
                type="text"
                placeholder="Ms. Riselle Mae B. Lucanas, SAO Adviser"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Minimum Attendance for Certificate</label>
              <div className="relative">
                <input type="number" placeholder="80" min="0" max="100"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent pr-8" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel */}
      <div>
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm sticky top-0">
          <h4 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
            <Users className="w-5 h-5 text-[#83358E]" />
            Estimated Reach
          </h4>
          <div className="space-y-4">
            <div className="p-4 bg-gradient-to-br from-[#0E4EBD] to-[#83358E] rounded-lg text-white text-center">
              <div className="text-3xl font-bold mb-1">387</div>
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
                {[
                  { dept: 'CCS', count: 145, color: 'bg-blue-500' },
                  { dept: 'CBA', count: 98, color: 'bg-green-500' },
                  { dept: 'CTE', count: 67, color: 'bg-purple-500' },
                  { dept: 'CAS', count: 77, color: 'bg-orange-500' },
                ].map((item) => (
                  <div key={item.dept}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-gray-700">{item.dept}</span>
                      <span className="font-bold text-gray-900">{item.count}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full ${item.color}`} style={{ width: `${(item.count / 387) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
