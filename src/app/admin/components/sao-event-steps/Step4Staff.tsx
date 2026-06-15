import { useState } from 'react';
import { Plus, Trash2, Shield, Key } from 'lucide-react';

interface Step4Props {
  data: any;
  onUpdate: (data: any) => void;
}

interface TeamMember {
  id: number;
  role: string;
  student: string;
  overrideEligibility: boolean;
}

interface Scanner {
  id: number;
  name: string;
  fullAccess: boolean;
  canCheckIn: boolean;
  canCheckOut: boolean;
  canViewList: boolean;
  canEditRecords: boolean;
  allowManualAttendance: boolean;
}

export default function Step4Staff({ data, onUpdate }: Step4Props) {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([
    { id: 1, role: '', student: '', overrideEligibility: false }
  ]);
  const [scanners, setScanners] = useState<Scanner[]>([
    { id: 1, name: '', fullAccess: false, canCheckIn: true, canCheckOut: true, canViewList: true, canEditRecords: false, allowManualAttendance: false }
  ]);

  const addTeamMember = () => {
    setTeamMembers([...teamMembers, { id: Date.now(), role: '', student: '', overrideEligibility: false }]);
  };

  const removeTeamMember = (id: number) => {
    if (teamMembers.length === 1) return;
    setTeamMembers(teamMembers.filter(m => m.id !== id));
  };

  const addScanner = () => {
    setScanners([...scanners, { id: Date.now(), name: '', fullAccess: false, canCheckIn: true, canCheckOut: true, canViewList: true, canEditRecords: false, allowManualAttendance: false }]);
  };

  const removeScanner = (id: number) => {
    setScanners(scanners.filter(s => s.id !== id));
  };

  const toggleScannerFullAccess = (id: number) => {
    setScanners(scanners.map(s =>
      s.id === id ? { ...s, fullAccess: !s.fullAccess, canCheckIn: true, canCheckOut: true, canViewList: true, canEditRecords: true } : s
    ));
  };

  return (
    <div className="grid grid-cols-[1fr_300px] gap-6">
      <div className="space-y-6">

        {/* Section A — Event Core Team */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="border-l-4 border-[#83358E] pl-3">
              <h3 className="text-[#001A4D] font-bold text-base">Event Core Team</h3>
            </div>
            <button
              onClick={addTeamMember}
              className="px-4 py-2 bg-[#1E70E8] text-white rounded-lg text-sm font-medium hover:bg-[#0E4EBD] flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Add Role
            </button>
          </div>

          <div className="space-y-3">
            {/* SAO Supervisor banner */}
            <div className="p-4 bg-gradient-to-br from-[#001A4D] to-[#83358E] rounded-lg border-2 border-[#FFC107]">
              <div className="flex items-center gap-2 mb-3">
                <Shield className="w-5 h-5 text-[#FFC107]" />
                <h4 className="font-bold text-white">SAO Event Supervisor</h4>
                <span className="px-2 py-0.5 bg-[#FFC107] text-[#001A4D] text-xs rounded font-medium">Admin Role</span>
              </div>
              <div className="flex items-center gap-3 px-4 py-2.5 bg-white rounded-lg">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#0E4EBD] to-[#83358E] flex items-center justify-center text-white font-bold text-sm">RL</div>
                <div>
                  <div className="font-medium text-gray-900">Riselle Mae B. Lucanas</div>
                  <div className="text-xs text-gray-500">SAO Adviser • Full Oversight</div>
                </div>
              </div>
            </div>

            {/* Team member rows */}
            {teamMembers.map((member, index) => (
              <div key={member.id} className="p-4 border border-gray-200 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-gray-900">Team Member {index + 1}</h4>
                  <button onClick={() => removeTeamMember(member.id)} className="text-red-500 hover:text-red-700 p-1">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Role</label>
                    <input
                      type="text"
                      placeholder="e.g., Logistics Head, Finance Officer"
                      value={member.role}
                      onChange={(e) => setTeamMembers(teamMembers.map(m => m.id === member.id ? { ...m, role: e.target.value } : m))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#83358E] focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Assign Student</label>
                    <input
                      type="text"
                      placeholder="Search all students..."
                      value={member.student}
                      onChange={(e) => setTeamMembers(teamMembers.map(m => m.id === member.id ? { ...m, student: e.target.value } : m))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#83358E] focus:border-transparent"
                    />
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded">
                  <input
                    type="checkbox"
                    checked={member.overrideEligibility}
                    onChange={(e) => setTeamMembers(teamMembers.map(m => m.id === member.id ? { ...m, overrideEligibility: e.target.checked } : m))}
                    className="text-[#83358E] focus:ring-[#83358E] rounded"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-gray-900">
                      Override Eligibility
                      <span className="px-2 py-0.5 bg-[#83358E] text-white text-xs rounded ml-2">Admin</span>
                    </div>
                    <div className="text-xs text-gray-600">Assign student regardless of organization membership</div>
                  </div>
                </div>

                {member.overrideEligibility && (
                  <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
                    Eligibility override active for this role
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Section B — Scanner Assignment */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="border-l-4 border-[#83358E] pl-3">
              <h3 className="text-[#001A4D] font-bold text-base">Scanner Assignment</h3>
            </div>
            <button
              onClick={addScanner}
              className="px-4 py-2 bg-[#1E70E8] text-white rounded-lg text-sm font-medium hover:bg-[#0E4EBD] flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Add Scanner
            </button>
          </div>

          <div className="space-y-3">
            {scanners.map((scanner, index) => (
              <div key={scanner.id} className="p-4 border border-gray-200 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-gray-900">Scanner Officer {index + 1}</h4>
                  {scanners.length > 1 && (
                    <button onClick={() => removeScanner(scanner.id)} className="text-red-600 hover:text-red-700 p-1">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="mb-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Assign Officer <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Search for officer..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#83358E] focus:border-transparent"
                  />
                </div>

                {/* Grant Full Admin Scanner Access */}
                <div className="mb-3 flex items-center gap-3 p-3 bg-[#83358E]/5 border border-[#83358E] rounded">
                  <div className="flex-1">
                    <div className="text-sm font-medium text-gray-900">
                      Grant Full Admin Scanner Access
                      <span className="px-2 py-0.5 bg-[#83358E] text-white text-xs rounded ml-2">Admin</span>
                    </div>
                    <div className="text-xs text-gray-600">Override all permissions to full access</div>
                  </div>
                  <button
                    onClick={() => toggleScannerFullAccess(scanner.id)}
                    className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${scanner.fullAccess ? 'bg-[#83358E]' : 'bg-gray-300'}`}
                  >
                    <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${scanner.fullAccess ? 'translate-x-6' : ''}`} />
                  </button>
                </div>

                {/* Permissions */}
                {!scanner.fullAccess && (
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-gray-700 mb-2">Scanner Permissions</div>
                    {[
                      { key: 'canCheckIn', label: 'Check-in Attendees' },
                      { key: 'canCheckOut', label: 'Check-out Attendees' },
                      { key: 'canViewList', label: 'View Attendance List' },
                      { key: 'canEditRecords', label: 'Edit Attendance Records' },
                    ].map((perm) => (
                      <label key={perm.key} className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded hover:bg-gray-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={scanner[perm.key as keyof Scanner] as boolean}
                          onChange={(e) => setScanners(scanners.map(s => s.id === scanner.id ? { ...s, [perm.key]: e.target.checked } : s))}
                          className="text-[#83358E] focus:ring-[#83358E] rounded"
                        />
                        <span className="text-sm text-gray-700">{perm.label}</span>
                      </label>
                    ))}

                    {/* Allow manual or flagged attendance */}
                    <label className="flex items-center gap-2 px-3 py-2 border border-[#FFC107]/40 bg-amber-50 rounded hover:bg-amber-100 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={scanner.allowManualAttendance}
                        onChange={(e) => setScanners(scanners.map(s => s.id === scanner.id ? { ...s, allowManualAttendance: e.target.checked } : s))}
                        className="text-[#FFC107] focus:ring-[#FFC107] rounded"
                      />
                      <span className="text-sm text-gray-700">Allow Manual or Flagged Attendance</span>
                    </label>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Panel — Team Hierarchy */}
      <div>
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm sticky top-0">
          <h4 className="font-bold text-gray-900 mb-3">Team Hierarchy</h4>
          <div className="space-y-3">
            <div className="p-3 bg-gradient-to-br from-[#001A4D] to-[#83358E] rounded-lg text-white text-center">
              <Shield className="w-6 h-6 mx-auto mb-1 text-[#FFC107]" />
              <div className="font-bold text-sm">SAO Adviser</div>
              <div className="text-xs opacity-80">Riselle Mae B. Lucanas</div>
            </div>

            <div className="h-4 border-l-2 border-gray-300 mx-auto w-0" />

            <div className="grid grid-cols-1 gap-2">
              {teamMembers.map((member, index) => (
                <div key={member.id} className="p-2 bg-[#1E70E8]/10 border border-[#1E70E8]/20 rounded text-center">
                  <div className="font-medium text-xs text-[#001A4D]">{member.role || `Role ${index + 1}`}</div>
                  <div className="text-xs text-gray-600">{member.student || 'Not assigned'}</div>
                </div>
              ))}
            </div>

            <div className="mt-4 pt-4 border-t-2 border-[#83358E]">
              <div className="flex items-center gap-2 mb-2">
                <Key className="w-4 h-4 text-[#83358E]" />
                <h5 className="text-sm font-bold text-gray-900">Scanner Activation Code</h5>
              </div>
              <div className="p-4 bg-[#83358E]/10 border-2 border-[#83358E] rounded-lg text-center">
                <div className="text-2xl font-mono font-bold text-[#001A4D] tracking-widest">452891</div>
                <div className="text-xs text-gray-600 mt-1">Enter in mobile app to activate scanner mode</div>
              </div>
            </div>

            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700">Scanner Officers</span>
                <span className="font-bold text-[#001A4D]">{scanners.length}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
