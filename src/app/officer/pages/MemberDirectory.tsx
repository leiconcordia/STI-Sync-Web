import { useState } from 'react';
import { Plus, Upload, Search, MoreVertical, X, Mail, Phone } from 'lucide-react';

interface Member {
  id: number;
  fullName: string;
  studentId: string;
  email: string;
  course: string;
  year: string;
  department: string;
  contactNumber: string;
  role: 'Officer' | 'Member';
  status: 'active' | 'inactive' | 'suspended';
  dateJoined: string;
  paymentStatus: 'paid' | 'outstanding';
  eventsAttended: number;
  totalEvents: number;
  avatar: string;
}

export default function MemberDirectory() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('All');
  const [filterYear, setFilterYear] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);

  const mockMembers: Member[] = [
    {
      id: 1,
      fullName: 'Juan Dela Cruz',
      studentId: '2021-00001',
      email: 'juan.delacruz@sti.edu',
      course: 'BSIT',
      year: '3rd Year',
      department: 'BSIT',
      contactNumber: '+63 912 345 6789',
      role: 'Officer',
      status: 'active',
      dateJoined: 'Aug 15, 2021',
      paymentStatus: 'paid',
      eventsAttended: 18,
      totalEvents: 20,
      avatar: 'JD',
    },
    {
      id: 2,
      fullName: 'Maria Santos',
      studentId: '2021-00002',
      email: 'maria.santos@sti.edu',
      course: 'BSCS',
      year: '2nd Year',
      department: 'BSCS',
      contactNumber: '+63 923 456 7890',
      role: 'Member',
      status: 'active',
      dateJoined: 'Sep 1, 2021',
      paymentStatus: 'paid',
      eventsAttended: 15,
      totalEvents: 20,
      avatar: 'MS',
    },
    {
      id: 3,
      fullName: 'Pedro Garcia',
      studentId: '2020-00123',
      email: 'pedro.garcia@sti.edu',
      course: 'BSIT',
      year: '4th Year',
      department: 'BSIT',
      contactNumber: '+63 934 567 8901',
      role: 'Officer',
      status: 'active',
      dateJoined: 'Aug 10, 2020',
      paymentStatus: 'outstanding',
      eventsAttended: 12,
      totalEvents: 20,
      avatar: 'PG',
    },
    {
      id: 4,
      fullName: 'Ana Reyes',
      studentId: '2022-00045',
      email: 'ana.reyes@sti.edu',
      course: 'BSA',
      year: '1st Year',
      department: 'BSA',
      contactNumber: '+63 945 678 9012',
      role: 'Member',
      status: 'inactive',
      dateJoined: 'Sep 5, 2022',
      paymentStatus: 'paid',
      eventsAttended: 5,
      totalEvents: 20,
      avatar: 'AR',
    },
    {
      id: 5,
      fullName: 'Carlos Lopez',
      studentId: '2021-00034',
      email: 'carlos.lopez@sti.edu',
      course: 'BSIT',
      year: '3rd Year',
      department: 'BSIT',
      contactNumber: '+63 956 789 0123',
      role: 'Member',
      status: 'active',
      dateJoined: 'Aug 20, 2021',
      paymentStatus: 'paid',
      eventsAttended: 16,
      totalEvents: 20,
      avatar: 'CL',
    },
    {
      id: 6,
      fullName: 'Sarah Lee',
      studentId: '2021-00056',
      email: 'sarah.lee@sti.edu',
      course: 'BSCS',
      year: '3rd Year',
      department: 'BSCS',
      contactNumber: '+63 967 890 1234',
      role: 'Member',
      status: 'active',
      dateJoined: 'Sep 10, 2021',
      paymentStatus: 'outstanding',
      eventsAttended: 14,
      totalEvents: 20,
      avatar: 'SL',
    },
  ];

  const filteredMembers = mockMembers.filter((member) => {
    const matchesSearch =
      member.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      member.studentId.includes(searchQuery);
    const matchesDepartment = filterDepartment === 'All' || member.department === filterDepartment;
    const matchesYear = filterYear === 'All' || member.year === filterYear;
    const matchesStatus = filterStatus === 'All' || member.status === filterStatus;

    return matchesSearch && matchesDepartment && matchesYear && matchesStatus;
  });

  const statusColors = {
    active: 'bg-[#639922] text-white',
    inactive: 'bg-[#888780] text-white',
    suspended: 'bg-[#E24B4A] text-white',
  };

  const roleColors = {
    Officer: 'bg-[#7F77DD] text-white',
    Member: 'bg-[#888780] text-white',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[#888780] text-[13px] mb-1">Dashboard &gt; Member Directory</div>
          <h1 className="text-[#001A4D] text-[24px] font-bold">Member Directory</h1>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-4 py-2.5 border border-[#E0E0E0] text-[#001A4D] rounded-lg text-[14px] font-medium hover:bg-[#F8F8F8]">
            <Upload className="w-4 h-4" />
            Import Members (CSV)
          </button>
          <button className="flex items-center gap-2 px-4 py-2.5 bg-[#7F77DD] text-white rounded-lg text-[14px] font-medium hover:bg-[#7F77DD]/90">
            <Plus className="w-5 h-5" />
            Add Member
          </button>
        </div>
      </div>

      <div className="bg-white border border-[#E0E0E0] rounded-xl p-4">
        <div className="flex items-center gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#888780]" />
            <input
              type="text"
              placeholder="Search by name or student ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-[#E0E0E0] rounded-lg text-[14px] focus:border-[#7F77DD] focus:ring-2 focus:ring-[#7F77DD]/20 outline-none"
            />
          </div>

          <select
            value={filterDepartment}
            onChange={(e) => setFilterDepartment(e.target.value)}
            className="px-4 py-2 border border-[#E0E0E0] rounded-lg text-[14px] text-[#001A4D] focus:border-[#7F77DD] focus:ring-2 focus:ring-[#7F77DD]/20 outline-none"
          >
            <option>All</option>
            <option>BSIT</option>
            <option>BSCS</option>
            <option>BSA</option>
          </select>

          <select
            value={filterYear}
            onChange={(e) => setFilterYear(e.target.value)}
            className="px-4 py-2 border border-[#E0E0E0] rounded-lg text-[14px] text-[#001A4D] focus:border-[#7F77DD] focus:ring-2 focus:ring-[#7F77DD]/20 outline-none"
          >
            <option>All</option>
            <option>1st Year</option>
            <option>2nd Year</option>
            <option>3rd Year</option>
            <option>4th Year</option>
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2 border border-[#E0E0E0] rounded-lg text-[14px] text-[#001A4D] focus:border-[#7F77DD] focus:ring-2 focus:ring-[#7F77DD]/20 outline-none"
          >
            <option>All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {filteredMembers.map((member) => (
          <div
            key={member.id}
            className="bg-white border border-[#E0E0E0] rounded-xl p-5 hover:shadow-lg transition-shadow"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="w-16 h-16 bg-[#7F77DD] rounded-full flex items-center justify-center text-white font-bold text-xl">
                {member.avatar}
              </div>
              <button className="p-1.5 hover:bg-[#F8F8F8] rounded-lg">
                <MoreVertical className="w-4 h-4 text-[#888780]" />
              </button>
            </div>

            <h3 className="text-[#001A4D] text-[16px] font-bold mb-1">{member.fullName}</h3>
            <p className="text-[#888780] text-[13px] mb-3">{member.studentId}</p>

            <p className="text-[#001A4D] text-[14px] mb-3">
              {member.course} · {member.year}
            </p>

            <div className="flex items-center gap-2 mb-4">
              <span className={`px-2 py-1 rounded text-[11px] font-medium ${roleColors[member.role]}`}>
                {member.role}
              </span>
              <span className={`px-2 py-1 rounded text-[11px] font-medium capitalize ${statusColors[member.status]}`}>
                {member.status}
              </span>
            </div>

            <div className="flex items-center gap-2 pt-3 border-t border-[#E0E0E0]">
              <button
                onClick={() => setSelectedMember(member)}
                className="flex-1 text-[#7F77DD] text-[13px] font-medium hover:underline text-center"
              >
                View Profile
              </button>
            </div>
          </div>
        ))}
      </div>

      {selectedMember && <MemberProfilePanel member={selectedMember} onClose={() => setSelectedMember(null)} />}
    </div>
  );
}

function MemberProfilePanel({ member, onClose }: { member: Member; onClose: () => void }) {
  const attendancePercentage = (member.eventsAttended / member.totalEvents) * 100;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />

      <div className="fixed right-0 top-0 h-full w-[360px] bg-white shadow-2xl z-50 overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-[#E0E0E0] px-6 py-4 flex items-center justify-between">
          <h2 className="text-[#001A4D] text-[18px] font-bold">Member Profile</h2>
          <button onClick={onClose} className="p-2 hover:bg-[#F8F8F8] rounded-lg">
            <X className="w-5 h-5 text-[#888780]" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="text-center">
            <div className="w-24 h-24 bg-[#7F77DD] rounded-full flex items-center justify-center text-white font-bold text-3xl mx-auto mb-4">
              {member.avatar}
            </div>
            <h3 className="text-[#001A4D] text-[20px] font-bold mb-1">{member.fullName}</h3>
            <p className="text-[#888780] text-[14px] mb-3">{member.studentId}</p>
            <div className="flex items-center justify-center gap-2">
              <span className={`px-3 py-1 rounded text-[12px] font-medium ${member.role === 'Officer' ? 'bg-[#7F77DD]' : 'bg-[#888780]'} text-white`}>
                {member.role}
              </span>
              <span className={`px-3 py-1 rounded text-[12px] font-medium capitalize ${member.status === 'active' ? 'bg-[#639922]' : member.status === 'inactive' ? 'bg-[#888780]' : 'bg-[#E24B4A]'} text-white`}>
                {member.status}
              </span>
            </div>
          </div>

          <div className="bg-[#F8F8F8] rounded-lg p-4 space-y-3">
            <h4 className="text-[#001A4D] text-[14px] font-bold mb-3">Contact Information</h4>
            <div className="flex items-center gap-3">
              <Mail className="w-4 h-4 text-[#888780]" />
              <div className="flex-1">
                <p className="text-[#888780] text-[11px]">Email</p>
                <p className="text-[#001A4D] text-[13px]">{member.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Phone className="w-4 h-4 text-[#888780]" />
              <div className="flex-1">
                <p className="text-[#888780] text-[11px]">Contact Number</p>
                <p className="text-[#001A4D] text-[13px]">{member.contactNumber}</p>
              </div>
            </div>
          </div>

          <div>
            <h4 className="text-[#001A4D] text-[14px] font-bold mb-3">Academic Information</h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[#888780] text-[13px]">Course</span>
                <span className="text-[#001A4D] text-[13px] font-medium">{member.course}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#888780] text-[13px]">Year Level</span>
                <span className="text-[#001A4D] text-[13px] font-medium">{member.year}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#888780] text-[13px]">Department</span>
                <span className="text-[#001A4D] text-[13px] font-medium">{member.department}</span>
              </div>
            </div>
          </div>

          <div>
            <h4 className="text-[#001A4D] text-[14px] font-bold mb-3">Organization Information</h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[#888780] text-[13px]">Date Joined</span>
                <span className="text-[#001A4D] text-[13px] font-medium">{member.dateJoined}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#888780] text-[13px]">Payment Status</span>
                <span
                  className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                    member.paymentStatus === 'paid'
                      ? 'bg-[#639922] text-white'
                      : 'bg-[#E24B4A] text-white'
                  }`}
                >
                  {member.paymentStatus === 'paid' ? 'Dues Paid' : 'Outstanding'}
                </span>
              </div>
            </div>
          </div>

          <div>
            <h4 className="text-[#001A4D] text-[14px] font-bold mb-3">Attendance Summary</h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-[#888780]">Events Attended</span>
                <span className="text-[#001A4D] font-medium">
                  {member.eventsAttended} / {member.totalEvents}
                </span>
              </div>
              <div className="w-full bg-[#E0E0E0] rounded-full h-2">
                <div
                  className="bg-[#7F77DD] h-2 rounded-full transition-all"
                  style={{ width: `${attendancePercentage}%` }}
                />
              </div>
              <p className="text-[#7F77DD] text-[12px] font-medium text-right">{attendancePercentage.toFixed(0)}%</p>
            </div>
          </div>

          <div className="space-y-3 pt-4">
            <button className="w-full px-4 py-2.5 bg-[#7F77DD] text-white rounded-lg text-[14px] font-medium hover:bg-[#7F77DD]/90 flex items-center justify-center gap-2">
              <Mail className="w-4 h-4" />
              Send Notification
            </button>
            <button className="w-full px-4 py-2.5 border border-[#E0E0E0] text-[#001A4D] rounded-lg text-[14px] font-medium hover:bg-[#F8F8F8]">
              Edit Member
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
