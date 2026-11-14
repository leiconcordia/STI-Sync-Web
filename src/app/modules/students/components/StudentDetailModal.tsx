import { formatPersonName } from '../../../utils/name.utils';
import { useState, useMemo } from 'react';
import { 
  X, User, Building2, CreditCard, CalendarCheck, 
  Mail, Phone, Calendar, Clock, ShieldCheck, CheckCircle2, 
  AlertCircle, Archive, FileText, ChevronRight, Hash, DollarSign,
  Shield, Check, Users
} from 'lucide-react';
import type { StudentDocument } from '../types/student.types';
import { useStudentDetail } from '../hooks/useStudentDetail';
import { useDepartments, useCourses } from '../../academic/hooks/useAcademicStream';
import { formatTimestampDate } from '../utils/date.utils';
import { formatCurrency } from '../../../utils/currency';
import { formatAppDate } from '../../../utils/date';

interface StudentDetailModalProps {
  student: StudentDocument;
  onClose: () => void;
  onArchive?: (student: StudentDocument) => void;
  readOnly?: boolean;
}

type TabType = 'profile' | 'clubs' | 'finances' | 'attendance';

export default function StudentDetailModal({
  student: initialStudent,
  onClose,
  onArchive,
  readOnly = false,
}: StudentDetailModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('profile');
  const [selectedAttendanceOrg, setSelectedAttendanceOrg] = useState<string>('all');
  const { student: streamedStudent, memberships, organizations, payables, attendances, stats, loading } = useStudentDetail(initialStudent);
  const { data: departments = [] } = useDepartments();
  const { data: courses = [] } = useCourses();

  const student = streamedStudent || initialStudent;

  const resolvedDepartmentName = useMemo(() => {
    const matchedCourse = courses.find(
      (c) =>
        (student.courseId && c.id === student.courseId) ||
        (student.courseCode && c.code?.toLowerCase() === student.courseCode.toLowerCase())
    );
    const deptKey = student.departmentId || matchedCourse?.departmentId || '';
    const matchedDept = departments.find(
      (d) =>
        (deptKey && (d.id === deptKey || d.code?.toLowerCase() === deptKey.toLowerCase())) ||
        (student.departmentName && d.name?.toLowerCase() === student.departmentName.toLowerCase())
    );
    if (matchedDept) {
      return matchedDept.name || matchedDept.code || '—';
    }
    if (student.departmentName && student.departmentName !== student.departmentId) {
      return student.departmentName;
    }
    if (student.departmentId && student.departmentId.length < 16 && !/^[A-Za-z0-9]{15,}$/.test(student.departmentId)) {
      return student.departmentId;
    }
    return '—';
  }, [departments, courses, student.departmentId, student.departmentName, student.courseId, student.courseCode]);

  // Build per-organization filter options for SAS Admin Event Attendance tab
  const attendanceOrgOptions = useMemo(() => {
    const map = new Map<string, string>();
    organizations
      .filter((o) => !o.archived)
      .forEach((o) => {
        map.set(o.id, o.acronym ? `${o.name} (${o.acronym})` : o.name);
      });

    let hasSasEvents = false;
    attendances.forEach((a) => {
      if (a.hostOrgId === '__sas__') {
        hasSasEvents = true;
      } else if (a.hostOrgId && !map.has(a.hostOrgId)) {
        map.set(a.hostOrgId, a.hostOrgName || a.hostOrgId);
      }
    });

    const orgList = Array.from(map.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label));

    if (hasSasEvents) {
      orgList.unshift({ id: '__sas__', label: 'Student Affairs & Services (SAS)' });
    }
    return orgList;
  }, [organizations, attendances]);

  const filteredAttendances = useMemo(() => {
    if (selectedAttendanceOrg === 'all') return attendances;
    return attendances.filter((a) => a.hostOrgId === selectedAttendanceOrg);
  }, [attendances, selectedAttendanceOrg]);

  const filteredAttendanceStats = useMemo(() => {
    if (selectedAttendanceOrg === 'all') {
      return {
        totalEvents: stats.totalEvents,
        eventsAttended: stats.eventsAttended,
        attendanceRate: stats.attendanceRate,
      };
    }
    const totalEvents = filteredAttendances.length;
    const eventsAttended = filteredAttendances.filter(
      (a) =>
        a.completedChecks >= a.totalExpectedChecks ||
        a.status === 'Complete' ||
        a.status === 'Checked In' ||
        a.status === 'Late'
    ).length;
    const attendanceRate = totalEvents > 0 ? Math.round((eventsAttended / totalEvents) * 100) : 100;
    return { totalEvents, eventsAttended, attendanceRate };
  }, [selectedAttendanceOrg, filteredAttendances, stats]);

  // Compute Payables Breakdown Grouped by Joined Organizations
  const orgPayablesBreakdown = useMemo(() => {
    const map = new Map<string, {
      orgId: string;
      orgName: string;
      orgAcronym: string;
      logoUrl?: string;
      role?: string;
      isMember: boolean;
      items: typeof payables;
      totalBilled: number;
      totalPaid: number;
      outstandingBalance: number;
    }>();

    // 1. Initialize with organizations the student has officially joined
    memberships.forEach(m => {
      map.set(m.organizationId, {
        orgId: m.organizationId,
        orgName: m.clubName,
        orgAcronym: m.clubAcronym || m.clubName.slice(0, 4).toUpperCase(),
        logoUrl: m.logoUrl,
        role: m.role || 'Member',
        isMember: true,
        items: [],
        totalBilled: 0,
        totalPaid: 0,
        outstandingBalance: 0,
      });
    });

    // 2. Associate payables with their corresponding organization
    const institutionalPayables: typeof payables = [];

    payables.forEach(p => {
      const orgId = p.organizationId;
      if (orgId && map.has(orgId)) {
        map.get(orgId)!.items.push(p);
      } else if (orgId) {
        if (!map.has(orgId)) {
          map.set(orgId, {
            orgId,
            orgName: p.organizationName || 'Student Organization',
            orgAcronym: (p.organizationName || 'ORG').slice(0, 4).toUpperCase(),
            role: 'Affiliate',
            isMember: false,
            items: [],
            totalBilled: 0,
            totalPaid: 0,
            outstandingBalance: 0,
          });
        }
        map.get(orgId)!.items.push(p);
      } else {
        institutionalPayables.push(p);
      }
    });

    // 3. Compute balances for each organization
    const list = Array.from(map.values()).map(entry => {
      const totalBilled = entry.items.reduce((sum, p) => sum + Number(p.assignedAmount || 0), 0);
      const totalPaid = entry.items.reduce((sum, p) => sum + Number(p.paidAmount || 0), 0);
      const outstandingBalance = Math.max(0, totalBilled - totalPaid);
      return {
        ...entry,
        totalBilled,
        totalPaid,
        outstandingBalance,
      };
    });

    // Add institutional fees (SAS) if any exist
    if (institutionalPayables.length > 0) {
      const totalBilled = institutionalPayables.reduce((sum, p) => sum + Number(p.assignedAmount || 0), 0);
      const totalPaid = institutionalPayables.reduce((sum, p) => sum + Number(p.paidAmount || 0), 0);
      list.unshift({
        orgId: 'sas-institutional',
        orgName: 'Student Affairs & Services (SAS Fees)',
        orgAcronym: 'SAS',
        role: 'Institution',
        isMember: true,
        items: institutionalPayables,
        totalBilled,
        totalPaid,
        outstandingBalance: Math.max(0, totalBilled - totalPaid),
      });
    }

    return list;
  }, [memberships, payables]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden border border-[#E0E0E0]">
        {/* Modal Header */}
        <div className="relative bg-gradient-to-r from-[#001A4D] via-[#002B7F] to-[#0E4EBD] px-8 py-6 text-white flex-shrink-0 shadow-sm">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex flex-col md:flex-row items-start md:items-center gap-5">
            <div className="w-20 h-20 rounded-2xl bg-white p-1 shadow-lg flex-shrink-0">
              {student.profilePhotoUrl ? (
                <img
                  src={student.profilePhotoUrl}
                  alt={`${student.firstName} ${student.lastName}`}
                  className="w-full h-full object-cover rounded-xl"
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(
                      `${student.firstName} ${student.lastName}`
                    )}&background=001A4D&color=fff&size=160`;
                  }}
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-[#001A4D] to-[#0E4EBD] rounded-xl flex items-center justify-center text-white font-bold text-2xl">
                  {student.firstName?.[0] || 'S'}{student.lastName?.[0] || 'T'}
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h2 className="text-2xl font-bold truncate">
                  {formatPersonName(student)}
                </h2>
                {student.status !== 'ACTIVE' && (
                  <span className={`px-3 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider ${
                    student.status === 'ARCHIVED' ? 'bg-gray-400 text-white' :
                    student.status === 'INACTIVE' ? 'bg-amber-500/90 text-white' :
                    'bg-blue-500 text-white'
                  }`}>
                    {student.status}
                  </span>
                )}
                {student.archiveReason && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs bg-white/20 text-white">
                    Reason: {student.archiveReason}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-white/80 text-sm">
                <span className="flex items-center gap-1 font-mono font-medium text-[#FFD41C]">
                  <Hash className="w-3.5 h-3.5" />
                  {student.studentId}
                </span>
                <span>•</span>
                <span>{student.courseCode} — {student.yearLevel}</span>
                <span>•</span>
                <span>Section: {student.section}</span>
                <span>•</span>
                <span>{student.schoolYear} ({student.semester})</span>
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-1 mt-6 border-b border-white/20 overflow-x-auto pb-px">
            <button
              onClick={() => setActiveTab('profile')}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'profile'
                  ? 'border-[#FFD41C] text-[#FFD41C]'
                  : 'border-transparent text-white/80 hover:text-white'
              }`}
            >
              <User className="w-4 h-4" />
              Profile & Info
            </button>
            <button
              onClick={() => setActiveTab('clubs')}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'clubs'
                  ? 'border-[#FFD41C] text-[#FFD41C]'
                  : 'border-transparent text-white/80 hover:text-white'
              }`}
            >
              <Building2 className="w-4 h-4" />
              Clubs
              {memberships.length > 0 && (
                <span className="ml-1 px-2 py-0.5 rounded-full text-xs bg-white/20 text-white font-mono">
                  {memberships.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('finances')}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'finances'
                  ? 'border-[#FFD41C] text-[#FFD41C]'
                  : 'border-transparent text-white/80 hover:text-white'
              }`}
            >
              <CreditCard className="w-4 h-4" />
              Finances & Payables
              {stats.outstandingBalance > 0 && (
                <span className="ml-1 px-2 py-0.5 rounded-full text-xs bg-red-500 text-white font-mono">
                  {formatCurrency(stats.outstandingBalance)}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('attendance')}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'attendance'
                  ? 'border-[#FFD41C] text-[#FFD41C]'
                  : 'border-transparent text-white/80 hover:text-white'
              }`}
            >
              <CalendarCheck className="w-4 h-4" />
              Event Attendance
              {attendances.length > 0 && (
                <span className="ml-1 px-2 py-0.5 rounded-full text-xs bg-white/20 text-white font-mono">
                  {attendances.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 bg-gray-50/50">
          {/* TAB 1: Profile & Info */}
          {activeTab === 'profile' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Personal Information */}
                <div className="bg-white rounded-xl p-5 border border-[#E0E0E0] shadow-sm space-y-4">
                  <h3 className="font-bold text-[#001A4D] text-base flex items-center gap-2 border-b border-gray-100 pb-3">
                    <User className="w-4 h-4 text-[#0E4EBD]" />
                    Personal Details
                  </h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-xs text-gray-500 font-medium block">Full Name</span>
                      <span className="font-medium text-[#001A4D]">{formatPersonName(student)}</span>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500 font-medium block">Student ID</span>
                      <span className="font-mono font-bold text-[#0E4EBD]">{student.studentId}</span>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500 font-medium block">Email Address</span>
                      <span className="font-medium text-gray-800 flex items-center gap-1.5 break-all">
                        <Mail className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                        {student.email}
                      </span>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500 font-medium block">Contact Number</span>
                      <span className="font-medium text-gray-800 flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                        {student.contactNumber || '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500 font-medium block">Date of Birth</span>
                      <span className="font-medium text-gray-800 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                        {student.dateOfBirth || '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500 font-medium block">Sex</span>
                      <span className="font-medium text-gray-800">{student.sex || '—'}</span>
                    </div>
                  </div>
                </div>

                {/* Academic Enrollment */}
                <div className="bg-white rounded-xl p-5 border border-[#E0E0E0] shadow-sm space-y-4">
                  <h3 className="font-bold text-[#001A4D] text-base flex items-center gap-2 border-b border-gray-100 pb-3">
                    <Building2 className="w-4 h-4 text-[#0E4EBD]" />
                    Academic & Enrollment
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-xs text-gray-500 font-medium block">Department</span>
                      <span className="font-medium text-[#001A4D] break-words">{resolvedDepartmentName}</span>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500 font-medium block">Program</span>
                      <span className="font-medium text-[#001A4D] break-words">{student.courseName} ({student.courseCode})</span>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500 font-medium block">Year Level</span>
                      <span className="font-medium text-gray-800">{student.yearLevel}</span>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500 font-medium block">Section</span>
                      <span className="font-medium text-gray-800">{student.section}</span>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500 font-medium block">School Year</span>
                      <span className="font-medium text-gray-800">{student.schoolYear}</span>
                    </div>
                  </div>

                  {/* Record Metadata */}
                  <div className="flex flex-wrap items-center justify-between pt-4 mt-2 border-t border-gray-100 text-xs text-gray-500">
                    <span>Registration Source: <strong className="text-gray-700">{student.registrationSource || 'MANUAL'}</strong></span>
                    <span>Registered Date: <strong className="text-gray-700">{formatTimestampDate(student.createdAt)}</strong></span>
                    <span>Last Record Update: <strong className="text-gray-700">{formatTimestampDate(student.updatedAt)}</strong></span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Clubs */}
          {activeTab === 'clubs' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-[#001A4D] text-base">Club Memberships & Roles</h3>
                <span className="text-xs text-gray-500">Joined in {memberships.length} club(s)</span>
              </div>

              {memberships.length === 0 ? (
                <div className="bg-white border border-[#E0E0E0] rounded-xl p-12 text-center text-gray-500">
                  <Building2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="font-medium text-gray-700">No Club Memberships Found</p>
                  <p className="text-xs text-gray-400 mt-1">This student is not currently registered as a member in any student clubs.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {memberships.map((m) => (
                    <div key={m.id} className="bg-white border border-[#E0E0E0] rounded-xl p-5 shadow-sm space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center font-bold text-[#001A4D] text-xs uppercase overflow-hidden border border-gray-200 flex-shrink-0">
                            {m.logoUrl ? (
                              <img src={m.logoUrl} alt={m.clubName} className="w-full h-full object-cover" />
                            ) : (
                              m.clubAcronym || m.clubName.slice(0, 3).toUpperCase()
                            )}
                          </div>
                          <div>
                            <h4 className="font-bold text-[#001A4D] text-base leading-tight">
                              {m.clubName}
                              {m.clubAcronym && (
                                <span className="ml-1.5 text-xs text-gray-500 font-medium">({m.clubAcronym})</span>
                              )}
                            </h4>
                            <p className="text-xs text-gray-500 mt-0.5">Role: <strong className="text-gray-800">{m.role}</strong></p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {m.isOfficer && (
                            <span className="px-2.5 py-0.5 bg-[#001A4D] text-[#FFD41C] rounded-full text-xs font-bold shadow-xs">
                              Officer
                            </span>
                          )}
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            m.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                          }`}>
                            {m.status}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs pt-2.5 border-t border-gray-100">
                        <div>
                          <span className="text-gray-400 block">Dues Status:</span>
                          <span className={`font-semibold ${
                            m.paymentStatus === 'paid' ? 'text-green-600' : 'text-amber-600'
                          }`}>
                            {m.paymentStatus === 'paid' ? '✓ Dues Paid' : '⚠ Outstanding Dues'}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-400 block">Date Joined:</span>
                          <span className="text-gray-700 font-medium">
                            {formatTimestampDate(m.dateJoined)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Finances & Payables */}
          {activeTab === 'finances' && (
            <div className="space-y-6">
              {/* Overall Financial Metrics Summary */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white border border-[#E0E0E0] rounded-xl p-4 shadow-sm">
                  <div className="text-xs font-bold text-gray-500 uppercase">Total Billed (All Orgs)</div>
                  <div className="text-2xl font-bold text-[#001A4D] mt-1">{formatCurrency(stats.totalBilled)}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{payables.length} total payable item(s)</div>
                </div>
                <div className="bg-white border border-[#E0E0E0] rounded-xl p-4 shadow-sm">
                  <div className="text-xs font-bold text-gray-500 uppercase">Total Paid</div>
                  <div className="text-2xl font-bold text-green-600 mt-1">{formatCurrency(stats.totalPaid)}</div>
                  <div className="text-xs text-gray-400 mt-0.5">Recorded collections</div>
                </div>
                <div className="bg-white border border-[#E0E0E0] rounded-xl p-4 shadow-sm">
                  <div className="text-xs font-bold text-gray-500 uppercase">Total Outstanding Balance</div>
                  <div className={`text-2xl font-bold mt-1 ${stats.outstandingBalance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {formatCurrency(stats.outstandingBalance)}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {stats.outstandingBalance > 0 ? 'Unsettled obligations' : 'Fully cleared across all organizations'}
                  </div>
                </div>
              </div>

              {/* Organization Payables Breakdown */}
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-gray-200 pb-3">
                  <div>
                    <h3 className="font-bold text-[#001A4D] text-base flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-[#0E4EBD]" />
                      Payables Breakdown by Organization
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Itemized dues, collections, and outstanding balance for each organization joined.
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-gray-500">
                    {orgPayablesBreakdown.length} organization(s) recorded
                  </span>
                </div>

                {orgPayablesBreakdown.length === 0 ? (
                  <div className="bg-white border border-[#E0E0E0] rounded-xl p-10 text-center text-gray-400 shadow-sm">
                    <Building2 className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                    <p className="font-semibold text-gray-700 text-sm">No Organization Payables Found</p>
                    <p className="text-xs text-gray-400 mt-1">This student has no payable records or joined organizations with assigned dues.</p>
                  </div>
                ) : (
                  orgPayablesBreakdown.map((orgEntry) => {
                    const isFullySettled = orgEntry.outstandingBalance <= 0;

                    return (
                      <div
                        key={orgEntry.orgId}
                        className="bg-white border border-[#E0E0E0] rounded-xl overflow-hidden shadow-sm transition-all"
                      >
                        {/* Organization Header & Balances */}
                        <div className="px-5 py-4 bg-gray-50/70 border-b border-gray-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-white border border-gray-200 flex items-center justify-center font-bold text-[#001A4D] text-xs uppercase overflow-hidden shadow-2xs flex-shrink-0">
                              {orgEntry.logoUrl ? (
                                <img src={orgEntry.logoUrl} alt={orgEntry.orgName} className="w-full h-full object-cover" />
                              ) : (
                                orgEntry.orgAcronym
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="font-bold text-[#001A4D] text-sm">{orgEntry.orgName}</h4>
                                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-100 text-blue-800">
                                  {orgEntry.orgAcronym}
                                </span>
                                {orgEntry.isMember && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 flex items-center gap-1">
                                    <Check className="w-3 h-3" /> Joined Member
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-gray-500 mt-0.5">
                                Role: <strong className="text-gray-700 capitalize">{orgEntry.role || 'Member'}</strong> • {orgEntry.items.length} payable record(s)
                              </p>
                            </div>
                          </div>

                          {/* Corresponding Balance Summary */}
                          <div className="flex items-center gap-3 self-start md:self-auto flex-wrap">
                            <div className="text-right text-xs">
                              <span className="text-gray-500 block">Billed: <strong className="text-gray-800">{formatCurrency(orgEntry.totalBilled)}</strong></span>
                              <span className="text-green-600 block">Paid: <strong>{formatCurrency(orgEntry.totalPaid)}</strong></span>
                            </div>
                            <div className={`px-3 py-1.5 rounded-xl border text-xs font-bold text-center ${
                              isFullySettled
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                : 'bg-red-50 border-red-200 text-red-700'
                            }`}>
                              <span className="block text-[10px] uppercase font-bold tracking-wider opacity-80">
                                {isFullySettled ? 'Standing' : 'Balance Due'}
                              </span>
                              <span>
                                {isFullySettled ? '✓ Fully Cleared' : formatCurrency(orgEntry.outstandingBalance)}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Payables Table for this Organization */}
                        {orgEntry.items.length === 0 ? (
                          <div className="p-5 text-center text-xs text-emerald-700 bg-emerald-50/30 flex items-center justify-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            <span>No outstanding fees or fines assigned for {orgEntry.orgName}. Standing is in good order.</span>
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs text-left">
                              <thead className="bg-gray-100/60 text-[11px] font-bold text-gray-600 uppercase border-b border-gray-200">
                                <tr>
                                  <th className="px-5 py-2.5">Payable Item</th>
                                  <th className="px-5 py-2.5">Type</th>
                                  <th className="px-5 py-2.5">Assigned / Paid</th>
                                  <th className="px-5 py-2.5">Due Date</th>
                                  <th className="px-5 py-2.5">Status</th>
                                  <th className="px-5 py-2.5">Payment Details</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {orgEntry.items.map((p) => {
                                  const assigned = Number(p.assignedAmount || 0);
                                  const paid = Number(p.paidAmount || 0);
                                  const isPaid = p.status === 'paid' || paid >= assigned;

                                  return (
                                    <tr key={p.id} className="hover:bg-gray-50/70 transition-colors">
                                      <td className="px-5 py-3">
                                        <div className="font-semibold text-[#001A4D]">{p.label}</div>
                                        {p.semester && (
                                          <div className="text-[10px] text-gray-400 mt-0.5">{p.schoolYear || ''} • {p.semester}</div>
                                        )}
                                      </td>
                                      <td className="px-5 py-3">
                                        <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-[11px] capitalize font-medium">
                                          {p.type?.replace('_', ' ')}
                                        </span>
                                      </td>
                                      <td className="px-5 py-3">
                                        <div className="font-mono font-bold text-gray-900">{formatCurrency(assigned)}</div>
                                        <div className="text-[11px] text-green-600 font-mono">Paid: {formatCurrency(paid)}</div>
                                      </td>
                                      <td className="px-5 py-3 text-gray-600">
                                        {formatAppDate(p.dueDate, '—')}
                                      </td>
                                      <td className="px-5 py-3">
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                          p.status === 'waived' ? 'bg-gray-100 text-gray-700' :
                                          p.status === 'refund_pending' ? 'bg-purple-100 text-purple-700' :
                                          p.status === 'refunded' ? 'bg-blue-100 text-blue-700' :
                                          isPaid ? 'bg-emerald-100 text-emerald-800' :
                                          p.status === 'overdue' ? 'bg-red-100 text-red-700' :
                                          'bg-amber-100 text-amber-800'
                                        }`}>
                                          {p.status === 'refund_pending' ? 'Refund Pending' : p.status}
                                        </span>
                                        {p.status === 'waived' && (
                                          <div className="text-[10px] text-gray-500 italic mt-0.5 max-w-[200px]" title={p.waivedReason || 'Waived'}>
                                            {p.waivedReason || 'Event Cancelled — Fine waived.'}
                                          </div>
                                        )}
                                      </td>
                                      <td className="px-5 py-3 text-gray-500">
                                        {p.paidAt ? (
                                          <div>
                                            <span className="block font-medium text-gray-700 text-[11px]">
                                              {formatAppDate(p.paidAt)}
                                            </span>
                                            <span className="text-[10px]">Method: {p.paymentMethod || 'Cash'}</span>
                                          </div>
                                        ) : (
                                          <span className="italic text-gray-400">Unpaid</span>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* TAB 4: Event Attendance */}
          {activeTab === 'attendance' && (
            <div className="space-y-6">
              {/* Attendance Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white border border-[#E0E0E0] rounded-xl p-4 shadow-sm">
                  <div className="text-xs font-bold text-gray-500 uppercase">Total Event Participations</div>
                  <div className="text-2xl font-bold text-[#001A4D] mt-1">{filteredAttendanceStats.totalEvents}</div>
                  <div className="text-xs text-gray-400 mt-0.5">Events registered / logged</div>
                </div>
                <div className="bg-white border border-[#E0E0E0] rounded-xl p-4 shadow-sm">
                  <div className="text-xs font-bold text-gray-500 uppercase">Events Attended</div>
                  <div className="text-2xl font-bold text-green-600 mt-1">{filteredAttendanceStats.eventsAttended}</div>
                  <div className="text-xs text-gray-400 mt-0.5">Verified check-ins</div>
                </div>
                <div className="bg-white border border-[#E0E0E0] rounded-xl p-4 shadow-sm">
                  <div className="text-xs font-bold text-gray-500 uppercase">Overall Attendance Rate</div>
                  <div className="text-2xl font-bold text-[#0E4EBD] mt-1">{filteredAttendanceStats.attendanceRate}%</div>
                  <div className="text-xs text-gray-400 mt-0.5">Campus event compliance</div>
                </div>
              </div>

              {/* Attendance Logs Table */}
              <div className="bg-white border border-[#E0E0E0] rounded-xl overflow-hidden shadow-sm">
                <div className="px-5 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-[#001A4D] text-base">Attendance History Logs</h3>
                    <span className="text-xs text-gray-500">
                      {selectedAttendanceOrg === 'all'
                        ? `${attendances.length} event log(s)`
                        : `${filteredAttendances.length} of ${attendances.length} event log(s)`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={selectedAttendanceOrg}
                      onChange={(e) => setSelectedAttendanceOrg(e.target.value)}
                      className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-medium text-gray-700 outline-none focus:ring-2 focus:ring-[#0E4EBD]/30 cursor-pointer max-w-[260px]"
                    >
                      <option value="all">All Organizations</option>
                      {attendanceOrgOptions.map((orgOpt) => (
                        <option key={orgOpt.id} value={orgOpt.id}>
                          {orgOpt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 text-xs font-bold text-gray-700 uppercase">
                      <tr>
                        <th className="px-5 py-3">Event Name</th>
                        <th className="px-5 py-3">Host / Organizer</th>
                        <th className="px-5 py-3">Attendance Checks</th>
                        <th className="px-5 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredAttendances.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-5 py-8 text-center text-gray-400">
                            {attendances.length === 0
                              ? 'No attendance logs recorded for this student yet.'
                              : 'No attendance logs found for the selected organization.'}
                          </td>
                        </tr>
                      ) : (
                        filteredAttendances.map((a) => (
                          <tr key={a.id} className="hover:bg-gray-50/80">
                            <td className="px-5 py-3.5 font-semibold text-[#001A4D]">{a.event}</td>
                            <td className="px-5 py-3.5 text-gray-600 text-xs font-medium">
                              {a.hostOrgName || a.org || 'SAO Event'}
                            </td>
                            <td className="px-5 py-3.5 text-xs font-mono">
                              <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold ${
                                a.completedChecks >= a.totalExpectedChecks
                                  ? 'bg-green-100 text-green-800'
                                  : a.completedChecks > 0
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-red-100 text-red-800'
                              }`}>
                                {a.completedChecks} / {a.totalExpectedChecks}
                              </span>
                            </td>
                            <td className="px-5 py-3.5">
                              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                                a.status === 'Complete' || a.status === 'Checked In' ? 'bg-green-100 text-green-700' :
                                a.status === 'Late' ? 'bg-amber-100 text-amber-700' :
                                'bg-red-100 text-red-700'
                              }`}>
                                {a.status}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-white border-t border-[#E0E0E0] flex items-center justify-between flex-shrink-0">
          <div>
            {!readOnly && student.status !== 'ARCHIVED' && onArchive && (
              <button
                onClick={() => onArchive(student)}
                className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors"
              >
                <Archive className="w-4 h-4" />
                Archive Student Account
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-6 py-2 bg-[#001A4D] text-white rounded-lg text-sm font-semibold hover:bg-[#001A4D]/90 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
