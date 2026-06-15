import { useState } from 'react';
import { Download, FileText, Users, UserCheck, UserMinus, UserX, ChevronDown, CheckCircle, AlertCircle } from 'lucide-react';

interface AttendanceRecord {
  id: number;
  studentName: string;
  studentId: string;
  course: string;
  year: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  duration: string | null;
  status: 'checked-in' | 'checked-out' | 'absent' | 'flagged';
  avatar: string;
}

interface ScanActivity {
  id: number;
  studentName: string;
  scanType: 'Check-In' | 'Check-Out';
  timestamp: string;
  avatar: string;
}

interface FlaggedEntry {
  id: number;
  studentName: string;
  reason: string;
  flaggedBy: string;
  timestamp: string;
}

export default function AttendanceLogs() {
  const [selectedEvent, setSelectedEvent] = useState('IT Guild GenAss');
  const [showFlagged, setShowFlagged] = useState(false);

  const events = ['IT Guild GenAss', 'JS Night', 'Sportsfest', 'Leadership Summit', 'Team Building'];

  const attendanceData: AttendanceRecord[] = [
    {
      id: 1,
      studentName: 'Juan Dela Cruz',
      studentId: '2021-00001',
      course: 'BSIT',
      year: '3rd Year',
      checkInTime: '8:05 AM',
      checkOutTime: '11:45 AM',
      duration: '3h 40m',
      status: 'checked-out',
      avatar: 'JD',
    },
    {
      id: 2,
      studentName: 'Maria Santos',
      studentId: '2021-00002',
      course: 'BSCS',
      year: '2nd Year',
      checkInTime: '8:10 AM',
      checkOutTime: null,
      duration: null,
      status: 'checked-in',
      avatar: 'MS',
    },
    {
      id: 3,
      studentName: 'Pedro Garcia',
      studentId: '2020-00123',
      course: 'BSIT',
      year: '4th Year',
      checkInTime: '8:15 AM',
      checkOutTime: '11:50 AM',
      duration: '3h 35m',
      status: 'checked-out',
      avatar: 'PG',
    },
    {
      id: 4,
      studentName: 'Ana Reyes',
      studentId: '2022-00045',
      course: 'BSA',
      year: '1st Year',
      checkInTime: '8:20 AM',
      checkOutTime: null,
      duration: null,
      status: 'flagged',
      avatar: 'AR',
    },
    {
      id: 5,
      studentName: 'Carlos Lopez',
      studentId: '2021-00034',
      course: 'BSIT',
      year: '3rd Year',
      checkInTime: null,
      checkOutTime: null,
      duration: null,
      status: 'absent',
      avatar: 'CL',
    },
  ];

  const scanActivity: ScanActivity[] = [
    { id: 1, studentName: 'Juan Dela Cruz', scanType: 'Check-In', timestamp: '2 min ago', avatar: 'JD' },
    { id: 2, studentName: 'Maria Santos', scanType: 'Check-In', timestamp: '5 min ago', avatar: 'MS' },
    { id: 3, studentName: 'Pedro Garcia', scanType: 'Check-Out', timestamp: '12 min ago', avatar: 'PG' },
    { id: 4, studentName: 'Ana Reyes', scanType: 'Check-In', timestamp: '15 min ago', avatar: 'AR' },
    { id: 5, studentName: 'Carlos Lopez', scanType: 'Check-In', timestamp: '20 min ago', avatar: 'CL' },
  ];

  const flaggedEntries: FlaggedEntry[] = [
    {
      id: 1,
      studentName: 'Ana Reyes',
      reason: 'Face-to-screen mismatch noted by officer',
      flaggedBy: 'Juan Dela Cruz',
      timestamp: '8:20 AM',
    },
    {
      id: 2,
      studentName: 'Mark Johnson',
      reason: 'Duplicate QR scan detected',
      flaggedBy: 'Maria Santos',
      timestamp: '8:25 AM',
    },
    {
      id: 3,
      studentName: 'Sarah Lee',
      reason: 'Check-in location discrepancy',
      flaggedBy: 'Pedro Garcia',
      timestamp: '8:30 AM',
    },
  ];

  const totalRegistered = attendanceData.length;
  const checkedIn = attendanceData.filter((r) => r.status === 'checked-in' || r.status === 'flagged').length;
  const checkedOut = attendanceData.filter((r) => r.status === 'checked-out').length;
  const absent = attendanceData.filter((r) => r.status === 'absent').length;

  const statusColors = {
    'checked-in': 'bg-[#639922] text-white',
    'checked-out': 'bg-[#888780] text-white',
    'absent': 'bg-[#E24B4A] text-white',
    'flagged': 'bg-[#BA7517] text-white',
  };

  return (
    <div className="flex gap-6">
      <div className="flex-1 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[#888780] text-[13px] mb-1">Dashboard &gt; Attendance Logs</div>
            <h1 className="text-[#001A4D] text-[24px] font-bold">Attendance Logs</h1>
          </div>
          <div className="flex items-center gap-3">
            <button className="flex items-center gap-2 px-4 py-2.5 border border-[#E0E0E0] text-[#001A4D] rounded-lg text-[14px] font-medium hover:bg-[#F8F8F8]">
              <Download className="w-4 h-4" />
              Export CSV
            </button>
            <button className="flex items-center gap-2 px-4 py-2.5 bg-[#7F77DD] text-white rounded-lg text-[14px] font-medium hover:bg-[#7F77DD]/90">
              <FileText className="w-4 h-4" />
              Generate Report
            </button>
          </div>
        </div>

        <div className="bg-white border border-[#E0E0E0] rounded-xl p-4">
          <div className="flex items-center gap-2 overflow-x-auto">
            {events.map((event) => (
              <button
                key={event}
                onClick={() => setSelectedEvent(event)}
                className={`px-4 py-2 rounded-lg text-[13px] font-medium whitespace-nowrap transition-colors ${
                  selectedEvent === event
                    ? 'bg-[#7F77DD] text-white'
                    : 'bg-[#F8F8F8] text-[#888780] hover:bg-[#EEEDFE]'
                }`}
              >
                {event}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white border border-[#E0E0E0] rounded-xl p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[#888780] text-[13px]">Total Registered</span>
              <Users className="w-5 h-5 text-[#888780]" />
            </div>
            <div className="text-[#001A4D] text-[24px] font-bold">{totalRegistered}</div>
          </div>

          <div className="bg-white border border-[#E0E0E0] rounded-xl p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[#888780] text-[13px]">Checked In</span>
              <UserCheck className="w-5 h-5 text-[#639922]" />
            </div>
            <div className="text-[#639922] text-[24px] font-bold">{checkedIn}</div>
          </div>

          <div className="bg-white border border-[#E0E0E0] rounded-xl p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[#888780] text-[13px]">Checked Out</span>
              <UserMinus className="w-5 h-5 text-[#888780]" />
            </div>
            <div className="text-[#888780] text-[24px] font-bold">{checkedOut}</div>
          </div>

          <div className="bg-white border border-[#E0E0E0] rounded-xl p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[#888780] text-[13px]">Absent</span>
              <UserX className="w-5 h-5 text-[#E24B4A]" />
            </div>
            <div className="text-[#E24B4A] text-[24px] font-bold">{absent}</div>
          </div>
        </div>

        <div className="bg-white border border-[#E0E0E0] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#F8F8F8] border-b border-[#E0E0E0]">
                <tr>
                  <th className="px-5 py-3 text-left">
                    <input type="checkbox" className="w-4 h-4 text-[#7F77DD] border-[#E0E0E0] rounded" />
                  </th>
                  <th className="px-5 py-3 text-left text-[#888780] text-[12px] font-bold uppercase tracking-wider">
                    Student
                  </th>
                  <th className="px-5 py-3 text-left text-[#888780] text-[12px] font-bold uppercase tracking-wider">
                    Student ID
                  </th>
                  <th className="px-5 py-3 text-left text-[#888780] text-[12px] font-bold uppercase tracking-wider">
                    Course & Year
                  </th>
                  <th className="px-5 py-3 text-left text-[#888780] text-[12px] font-bold uppercase tracking-wider">
                    Check-In
                  </th>
                  <th className="px-5 py-3 text-left text-[#888780] text-[12px] font-bold uppercase tracking-wider">
                    Check-Out
                  </th>
                  <th className="px-5 py-3 text-left text-[#888780] text-[12px] font-bold uppercase tracking-wider">
                    Duration
                  </th>
                  <th className="px-5 py-3 text-left text-[#888780] text-[12px] font-bold uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E0E0E0]">
                {attendanceData.map((record) => (
                  <tr key={record.id} className="hover:bg-[#EEEDFE] transition-colors">
                    <td className="px-5 py-4">
                      <input type="checkbox" className="w-4 h-4 text-[#7F77DD] border-[#E0E0E0] rounded" />
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-[#7F77DD] rounded-full flex items-center justify-center text-white font-semibold text-xs">
                          {record.avatar}
                        </div>
                        <span className="text-[#001A4D] text-[13px] font-medium">{record.studentName}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-[#888780] text-[13px]">{record.studentId}</td>
                    <td className="px-5 py-4 text-[#888780] text-[13px]">
                      {record.course} · {record.year}
                    </td>
                    <td className="px-5 py-4 text-[#001A4D] text-[13px]">{record.checkInTime || '—'}</td>
                    <td className="px-5 py-4 text-[#001A4D] text-[13px]">{record.checkOutTime || '—'}</td>
                    <td className="px-5 py-4 text-[#888780] text-[13px]">{record.duration || '—'}</td>
                    <td className="px-5 py-4">
                      <span className={`px-2 py-1 rounded text-[11px] font-medium capitalize ${statusColors[record.status]}`}>
                        {record.status.replace('-', ' ')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-5 py-4 border-t border-[#E0E0E0] flex items-center justify-between">
            <p className="text-[#888780] text-[13px]">Showing 1–5 of 85 students</p>
            <div className="flex items-center gap-2">
              <button className="px-3 py-1.5 border border-[#E0E0E0] rounded text-[13px] text-[#888780] hover:bg-[#F8F8F8]">
                Previous
              </button>
              <button className="px-3 py-1.5 bg-[#7F77DD] text-white rounded text-[13px]">1</button>
              <button className="px-3 py-1.5 border border-[#E0E0E0] rounded text-[13px] text-[#888780] hover:bg-[#F8F8F8]">
                2
              </button>
              <button className="px-3 py-1.5 border border-[#E0E0E0] rounded text-[13px] text-[#888780] hover:bg-[#F8F8F8]">
                Next
              </button>
            </div>
          </div>
        </div>

        <div className={`bg-white border-2 ${showFlagged ? 'border-[#BA7517]' : 'border-[#E0E0E0]'} rounded-xl overflow-hidden`}>
          <button
            onClick={() => setShowFlagged(!showFlagged)}
            className="w-full px-5 py-4 flex items-center justify-between hover:bg-[#FEF3C7] transition-colors"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-[#BA7517]" />
              <span className="text-[#BA7517] text-[14px] font-bold">⚠ Flagged Entries ({flaggedEntries.length})</span>
            </div>
            <ChevronDown className={`w-5 h-5 text-[#BA7517] transition-transform ${showFlagged ? 'rotate-180' : ''}`} />
          </button>

          {showFlagged && (
            <div className="border-t border-[#BA7517]">
              <table className="w-full">
                <thead className="bg-[#FEF3C7] border-b border-[#BA7517]">
                  <tr>
                    <th className="px-5 py-3 text-left text-[#BA7517] text-[12px] font-bold uppercase">Student</th>
                    <th className="px-5 py-3 text-left text-[#BA7517] text-[12px] font-bold uppercase">Reason</th>
                    <th className="px-5 py-3 text-left text-[#BA7517] text-[12px] font-bold uppercase">Flagged By</th>
                    <th className="px-5 py-3 text-left text-[#BA7517] text-[12px] font-bold uppercase">Time</th>
                    <th className="px-5 py-3 text-left text-[#BA7517] text-[12px] font-bold uppercase">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E0E0E0]">
                  {flaggedEntries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-[#FEF3C7]/20">
                      <td className="px-5 py-4 text-[#001A4D] text-[13px] font-medium">{entry.studentName}</td>
                      <td className="px-5 py-4 text-[#888780] text-[13px]">{entry.reason}</td>
                      <td className="px-5 py-4 text-[#888780] text-[13px]">{entry.flaggedBy}</td>
                      <td className="px-5 py-4 text-[#888780] text-[13px]">{entry.timestamp}</td>
                      <td className="px-5 py-4">
                        <button className="px-3 py-1.5 bg-[#7F77DD] text-white rounded-lg text-[12px] font-medium hover:bg-[#7F77DD]/90">
                          Resolve
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="w-[280px] bg-white border border-[#E0E0E0] rounded-xl p-5 h-fit sticky top-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[#001A4D] text-[14px] font-bold">Scan Activity Feed</h3>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-[#639922] rounded-full animate-pulse" />
            <span className="text-[#639922] text-[11px] font-medium">Live</span>
          </div>
        </div>

        <div className="space-y-3">
          {scanActivity.map((scan) => (
            <div key={scan.id} className="flex items-start gap-3 pb-3 border-b border-[#E0E0E0] last:border-0">
              <div className="w-8 h-8 bg-[#7F77DD] rounded-full flex items-center justify-center text-white font-semibold text-xs">
                {scan.avatar}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[#001A4D] text-[13px] font-medium truncate">{scan.studentName}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                      scan.scanType === 'Check-In' ? 'bg-[#639922] text-white' : 'bg-[#888780] text-white'
                    }`}
                  >
                    {scan.scanType}
                  </span>
                  <span className="text-[#888780] text-[11px]">{scan.timestamp}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
