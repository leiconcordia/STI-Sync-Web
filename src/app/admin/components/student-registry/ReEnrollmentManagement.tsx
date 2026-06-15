import { Bell, Download, Check, Clock, AlertTriangle, UserX, Edit, ArrowRight, RefreshCw } from 'lucide-react';

export default function ReEnrollmentManagement() {
  const students = [
    { id: 1, name: 'Juan Dela Cruz', studentId: '2025-001234', prevYear: '2nd Year', newYear: '3rd Year', course: 'BSIT', section: 'A', status: 'confirmed', confirmedDate: 'May 25, 2026' },
    { id: 2, name: 'Maria Santos', studentId: '2025-002345', prevYear: '1st Year', newYear: '2nd Year', course: 'BSCS', section: 'B', status: 'pending', confirmedDate: null },
    { id: 3, name: 'Pedro Garcia', studentId: '2025-003456', prevYear: '3rd Year', newYear: '4th Year', course: 'BSA', section: 'A', status: 'overdue', confirmedDate: null },
    { id: 4, name: 'Ana Reyes', studentId: '2025-004567', prevYear: '2nd Year', newYear: '3rd Year', course: 'BSBA', section: 'C', status: 'info-updated', confirmedDate: 'May 28, 2026' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#001A4D]">Re-enrollment Management</h2>
          <p className="text-sm text-gray-500">Dashboard → Student Registry → Re-enrollment Management</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="px-6 py-2.5 bg-[#83358E] text-white rounded-lg font-medium hover:bg-[#83358E]/90 flex items-center gap-2">
            <Bell className="w-4 h-4" />
            Send Bulk Reminder
          </button>
          <button className="px-6 py-2.5 bg-[#001A4D] text-white rounded-lg font-medium hover:bg-[#001A4D]/90 flex items-center gap-2">
            <Download className="w-4 h-4" />
            Export Status
          </button>
        </div>
      </div>

      {/* Semester Re-enrollment Progress Card */}
      <div className="bg-white border border-[#E0E0E0] rounded-xl overflow-hidden">
        <div className="bg-gradient-to-r from-[#001A4D] to-[#0C3C8A] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="text-white font-bold text-lg">A.Y. 2026–2027 — 1st Semester Re-enrollment</h3>
            <span className="px-3 py-1 bg-[#FFD41C] text-[#001A4D] rounded-full text-xs font-bold animate-pulse">
              In Progress
            </span>
          </div>
        </div>

        <div className="p-6">
          <div className="bg-gray-200 rounded-full h-5 mb-4 overflow-hidden">
            <div
              className="bg-[#83358E] h-full transition-all flex items-center justify-between px-3"
              style={{ width: '68%' }}
            >
              <span className="text-white text-xs font-medium">342 / 500 students confirmed</span>
              <span className="text-white text-xs font-bold">68%</span>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-4 mb-4">
            <div className="bg-gradient-to-br from-[#22C55E] to-[#16A34A] rounded-lg p-4 text-white text-center">
              <div className="text-3xl font-bold">342</div>
              <div className="text-xs">Confirmed</div>
            </div>
            <div className="bg-gradient-to-br from-[#FFC107] to-[#F59E0B] rounded-lg p-4 text-white text-center">
              <div className="text-3xl font-bold">128</div>
              <div className="text-xs">Pending</div>
            </div>
            <div className="bg-gradient-to-br from-[#EF4444] to-[#F97316] rounded-lg p-4 text-white text-center">
              <div className="text-3xl font-bold">24</div>
              <div className="text-xs">Overdue</div>
            </div>
            <div className="bg-gradient-to-br from-[#001A4D] to-[#0C3C8A] rounded-lg p-4 text-white text-center">
              <div className="text-3xl font-bold">6</div>
              <div className="text-xs">Auto-Inactivated</div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-700">Re-enrollment Deadline:</span>
              <span className="font-bold text-[#001A4D]">June 15, 2026</span>
              <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded text-xs">14 days remaining</span>
            </div>
            <button className="text-[#0E4EBD] text-sm hover:underline">Extend Deadline</button>
          </div>
        </div>
      </div>

      {/* Re-enrollment Status Table */}
      <div className="bg-white border border-[#E0E0E0] rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-4">
          <button className="px-4 py-2 bg-[#001A4D] text-white rounded-lg text-sm font-medium border-b-2 border-[#83358E]">
            All <span className="ml-2 px-2 py-0.5 bg-white/20 rounded">500</span>
          </button>
          <button className="px-4 py-2 text-[#001A4D] hover:bg-gray-50 rounded-lg text-sm font-medium">
            Confirmed <span className="ml-2 px-2 py-0.5 bg-green-100 text-green-700 rounded">342</span>
          </button>
          <button className="px-4 py-2 text-[#001A4D] hover:bg-gray-50 rounded-lg text-sm font-medium">
            Pending <span className="ml-2 px-2 py-0.5 bg-amber-100 text-amber-700 rounded">128</span>
          </button>
          <button className="px-4 py-2 text-[#001A4D] hover:bg-gray-50 rounded-lg text-sm font-medium">
            Overdue <span className="ml-2 px-2 py-0.5 bg-red-100 text-red-700 rounded">24</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left">
                  <input type="checkbox" className="rounded text-[#83358E]" />
                </th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-700">Student</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-700">Student ID</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-700">Year Level Transition</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-700">Course & Section</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-700">Status</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-700">Confirmed Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {students.map((student) => (
                <tr key={student.id} className="hover:bg-[#F3E8FF] transition-colors">
                  <td className="px-6 py-4">
                    <input type="checkbox" className="rounded text-[#83358E]" />
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gradient-to-br from-[#0E4EBD] to-[#83358E] rounded-full flex items-center justify-center text-white font-bold text-xs">
                        {student.name.split(' ').map(n => n[0]).join('')}
                      </div>
                      <span className="font-medium text-[#001A4D]">{student.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700">{student.studentId}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">{student.prevYear}</span>
                      <ArrowRight className="w-4 h-4 text-[#83358E]" />
                      <span className="text-sm font-medium text-[#83358E]">{student.newYear}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700">{student.course} - {student.section}</td>
                  <td className="px-6 py-4">
                    {student.status === 'confirmed' && (
                      <span className="inline-flex items-center gap-1 px-3 py-1 bg-gradient-to-r from-[#22C55E] to-[#16A34A] text-white rounded-full text-xs font-medium">
                        <Check className="w-3 h-3" />
                        Confirmed
                      </span>
                    )}
                    {student.status === 'pending' && (
                      <span className="inline-flex items-center gap-1 px-3 py-1 bg-amber-500 text-white rounded-full text-xs font-medium">
                        <Clock className="w-3 h-3" />
                        Pending
                      </span>
                    )}
                    {student.status === 'overdue' && (
                      <span className="inline-flex items-center gap-1 px-3 py-1 bg-gradient-to-r from-[#EF4444] to-[#F97316] text-white rounded-full text-xs font-medium">
                        <AlertTriangle className="w-3 h-3" />
                        Overdue
                      </span>
                    )}
                    {student.status === 'info-updated' && (
                      <span className="inline-flex items-center gap-1 px-3 py-1 bg-[#0E4EBD] text-white rounded-full text-xs font-medium">
                        <Edit className="w-3 h-3" />
                        Info Updated
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700">{student.confirmedDate || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
