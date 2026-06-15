import { GraduationCap, Download, Eye, RotateCcw } from 'lucide-react';

export default function ArchivedGraduates() {
  const archivedStudents = [
    { id: 1, name: 'Miguel Santos', studentId: '2022-001234', course: 'BSIT', archiveDate: 'March 30, 2026', archiveReason: 'Graduated', avatar: 'MS' },
    { id: 2, name: 'Jasmine Cruz', studentId: '2022-002345', course: 'BSCS', archiveDate: 'March 30, 2026', archiveReason: 'Graduated', avatar: 'JC' },
    { id: 3, name: 'Ramon Garcia', studentId: '2023-003456', course: 'BSA', archiveDate: 'June 15, 2025', archiveReason: 'Transferred', avatar: 'RG' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#001A4D]">Archived Accounts</h2>
          <p className="text-sm text-gray-500">Dashboard → Student Registry → Archived / Graduates</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="px-6 py-2.5 bg-[#83358E] text-white rounded-lg font-medium hover:bg-[#83358E]/90 flex items-center gap-2">
            <GraduationCap className="w-4 h-4" />
            Archive Graduates
          </button>
          <button className="px-6 py-2.5 bg-[#001A4D] text-white rounded-lg font-medium hover:bg-[#001A4D]/90 flex items-center gap-2">
            <Download className="w-4 h-4" />
            Export Archive
          </button>
        </div>
      </div>

      {/* Archive Batch Action Card */}
      <div className="bg-gradient-to-r from-[#001A4D] to-[#0C3C8A] rounded-xl p-6">
        <h3 className="text-white font-bold text-lg mb-2">End of Academic Year — Archive Graduates</h3>
        <p className="text-white/90 text-sm mb-4">
          Archive all students who have completed their program. Archived accounts are permanently deactivated but all records are preserved for institutional reporting.
        </p>
        <div className="flex items-center gap-3">
          <button className="px-6 py-2.5 bg-[#FFD41C] text-[#001A4D] rounded-lg font-medium hover:bg-[#FFD41C]/90">
            Select Graduates to Archive
          </button>
          <button className="text-white hover:underline text-sm">
            Dismiss
          </button>
        </div>
      </div>

      {/* Archive Table */}
      <div className="bg-white border border-[#E0E0E0] rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-bold text-gray-700">Student</th>
              <th className="px-6 py-3 text-left text-xs font-bold text-gray-700">Course</th>
              <th className="px-6 py-3 text-left text-xs font-bold text-gray-700">Archive Date</th>
              <th className="px-6 py-3 text-left text-xs font-bold text-gray-700">Archive Reason</th>
              <th className="px-6 py-3 text-left text-xs font-bold text-gray-700">Status</th>
              <th className="px-6 py-3 text-left text-xs font-bold text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {archivedStudents.map((student) => (
              <tr key={student.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-gray-600 rounded-full flex items-center justify-center text-white font-bold text-xs">
                      {student.avatar}
                    </div>
                    <div>
                      <div className="font-medium text-[#001A4D]">{student.name}</div>
                      <div className="text-xs text-gray-500">{student.studentId}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-700">{student.course}</td>
                <td className="px-6 py-4 text-sm text-gray-700">{student.archiveDate}</td>
                <td className="px-6 py-4">
                  {student.archiveReason === 'Graduated' && (
                    <span className="px-3 py-1 bg-[#FFD41C] text-[#001A4D] rounded-full text-xs font-medium">
                      Graduated
                    </span>
                  )}
                  {student.archiveReason === 'Transferred' && (
                    <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                      Transferred
                    </span>
                  )}
                </td>
                <td className="px-6 py-4">
                  <span className="px-3 py-1 bg-gray-600 text-white rounded-full text-xs font-medium">
                    Archived
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <button className="px-3 py-1.5 text-[#0E4EBD] hover:underline text-xs flex items-center gap-1">
                      <Eye className="w-3 h-3" />
                      View Record
                    </button>
                    <button className="px-3 py-1.5 border-2 border-[#0E4EBD] text-[#0E4EBD] rounded text-xs font-medium flex items-center gap-1">
                      <RotateCcw className="w-3 h-3" />
                      Restore
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
