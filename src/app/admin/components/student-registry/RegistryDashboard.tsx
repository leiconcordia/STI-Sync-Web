import { UserCheck, UserX, Archive, Users } from 'lucide-react';
import { StudentDocument } from '../../../modules/students/types/student.types';
import { SemesterDocument } from '../../../modules/academic/types/academic.types';
import { getMillis } from '../../../modules/students/utils/date.utils';

interface RegistryDashboardProps {
  onNavigate: (view: string, studentIdOrSearch?: string) => void;
  categorizedStudents: {
    active: StudentDocument[];
    inactive: StudentDocument[];
    archived: StudentDocument[];
    reenrollment: StudentDocument[];
  };
  activeSemester?: SemesterDocument;
  activeCollegePeriod?: SemesterDocument;
  activeShsPeriod?: SemesterDocument;
  allStudents: StudentDocument[];
}

export default function RegistryDashboard({
  onNavigate,
  categorizedStudents,
  activeCollegePeriod,
  activeShsPeriod,
  allStudents,
}: RegistryDashboardProps) {
  const { active, inactive, archived, reenrollment } = categorizedStudents;

  // Calculate College Breakdown
  const collegeStudents = active.filter(
    (s) =>
      s.academicLevel === 'COLLEGE' ||
      (!s.academicLevel && !String(s.semester).includes('Trimester') && s.yearLevel !== 'Grade 11' && s.yearLevel !== 'Grade 12')
  );

  // Calculate SHS Breakdown
  const shsStudents = active.filter(
    (s) =>
      s.academicLevel === 'SHS' ||
      String(s.semester).includes('Trimester') ||
      s.yearLevel === 'Grade 11' ||
      s.yearLevel === 'Grade 12'
  );

  // Recent activity
  const recentActivity = [...allStudents]
    .sort((a, b) => getMillis(b.updatedAt) - getMillis(a.updatedAt))
    .slice(0, 5)
    .map((student) => {
      let action = '';
      let type = '';
      switch (student.status) {
        case 'ACTIVE':
          action =
            student.isProfileComplete === false
              ? `${student.firstName} ${student.lastName} — Profile Setup Pending`
              : `${student.firstName} ${student.lastName} — Account Active`;
          type = 'approved';
          break;
        case 'INACTIVE':
          action = `${student.firstName} ${student.lastName} — Account Inactive`;
          type = 'blue';
          break;
        case 'ARCHIVED':
          action = `${student.firstName} ${student.lastName} — Account Archived`;
          type = 'blue';
          break;
        default:
          action = `${student.firstName} ${student.lastName} — Status Updated`;
          type = 'blue';
          break;
      }

      const updatedAtMs = getMillis(student.updatedAt);
      const diff = updatedAtMs ? Math.max(0, Date.now() - updatedAtMs) : 0;
      const minutes = Math.floor(diff / 60000);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);
      let timeString = '';
      if (!updatedAtMs) timeString = 'Just now';
      else if (days > 0) timeString = `${days} day${days > 1 ? 's' : ''} ago`;
      else if (hours > 0) timeString = `${hours} hour${hours > 1 ? 's' : ''} ago`;
      else if (minutes > 0) timeString = `${minutes} min ago`;
      else timeString = 'Just now';

      return { action, type, time: timeString };
    });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#001A4D]">Student Registry</h2>
        </div>
      </div>

      {/* Academic Period Enrollment Status Banner */}
      {(activeCollegePeriod || activeShsPeriod) && (
        <div className="bg-gradient-to-r from-[#001A4D] via-[#002B7F] to-[#0E4EBD] rounded-2xl p-6 border-l-8 border-[#FFD41C] text-white shadow-md space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2.5 py-0.5 bg-[#FFD41C] text-[#001A4D] rounded-full text-xs font-bold uppercase tracking-wider">
                  Active Enrollment Term
                </span>
              </div>
              <h3 className="text-xl font-bold">Academic Period Enrollment Status</h3>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* College Students Breakdown */}
            {activeCollegePeriod && (
              <div className="bg-white/10 backdrop-blur-xs rounded-xl p-4 border border-white/20">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-base text-[#FFD41C]">College Department</span>
                  <span className="text-xs bg-white/20 px-2.5 py-0.5 rounded-full font-medium">
                    {activeCollegePeriod.semester} ({activeCollegePeriod.academicYear})
                  </span>
                </div>
                <div className="bg-black/20 rounded-lg p-3 text-center my-3">
                  <div className="text-2xl font-bold text-green-400">{collegeStudents.length}</div>
                  <div className="text-xs text-white/80">Active Enrolled Students</div>
                </div>
              </div>
            )}

            {/* Senior High School Breakdown */}
            {activeShsPeriod && (
              <div className="bg-white/10 backdrop-blur-xs rounded-xl p-4 border border-white/20">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-base text-[#FFD41C]">Senior High School (SHS)</span>
                  <span className="text-xs bg-white/20 px-2.5 py-0.5 rounded-full font-medium">
                    {activeShsPeriod.semester} ({activeShsPeriod.academicYear})
                  </span>
                </div>
                <div className="bg-black/20 rounded-lg p-3 text-center my-3">
                  <div className="text-2xl font-bold text-green-400">{shsStudents.length}</div>
                  <div className="text-xs text-white/80">Active Enrolled Students</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Status Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <button
          onClick={() => onNavigate('active')}
          className="relative bg-gradient-to-br from-[#22C55E] to-[#16A34A] rounded-xl p-6 text-white overflow-hidden group hover:shadow-lg transition-shadow text-left cursor-pointer"
        >
          <div className="absolute top-4 right-4 bg-white/20 p-3 rounded-lg">
            <UserCheck className="w-6 h-6" />
          </div>
          <div className="text-5xl font-bold mb-2">{active.length}</div>
          <div className="text-sm font-medium mb-1">Active Students</div>
          <div className="text-xs text-white/80">Currently enrolled & active</div>
        </button>

        <button
          onClick={() => onNavigate('inactive')}
          className="relative bg-gradient-to-br from-[#001A4D] to-[#0C3C8A] rounded-xl p-6 text-white overflow-hidden group hover:shadow-lg transition-shadow text-left cursor-pointer"
        >
          <div className="absolute top-4 right-4 bg-white/20 p-3 rounded-lg">
            <UserX className="w-6 h-6" />
          </div>
          <div className="text-5xl font-bold mb-2">{inactive.length}</div>
          <div className="text-sm font-medium mb-1">Inactive Students</div>
          <div className="text-xs text-white/80">Did not re-enroll / dropped</div>
        </button>

        <button
          onClick={() => onNavigate('archived')}
          className="relative bg-gradient-to-br from-[#8B5CF6] to-[#6D28D9] rounded-xl p-6 text-white overflow-hidden group hover:shadow-lg transition-shadow text-left cursor-pointer"
        >
          <div className="absolute top-4 right-4 bg-white/20 p-3 rounded-lg">
            <Archive className="w-6 h-6" />
          </div>
          <div className="text-5xl font-bold mb-2">{archived.length}</div>
          <div className="text-sm font-medium mb-1">Archived Graduates</div>
          <div className="text-xs text-white/80">Alumni records & graduates</div>
        </button>
      </div>

      {/* Two-column section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Registry Overview & Distribution */}
        <div className="lg:col-span-7 bg-white border border-[#E0E0E0] rounded-xl overflow-hidden shadow-xs flex flex-col justify-between">
          <div>
            <div className="bg-gradient-to-r from-[#001A4D] to-[#0E4EBD] px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Users className="w-5 h-5 text-[#FFD41C]" />
                <h3 className="text-white font-bold">Enrollment Distribution & Status</h3>
              </div>
              <span className="px-3 py-1 bg-white/20 text-white rounded-full text-xs font-mono font-bold">
                {allStudents.length} Total Enrolled
              </span>
            </div>

            <div className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-blue-50/60 rounded-xl border border-blue-100">
                  <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                    College Department
                  </div>
                  <div className="text-2xl font-black text-[#001A4D]">{collegeStudents.length}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {collegeConfirmed} verified enrolled
                  </div>
                </div>

                <div className="p-4 bg-amber-50/60 rounded-xl border border-amber-100">
                  <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                    Senior High School
                  </div>
                  <div className="text-2xl font-black text-[#001A4D]">{shsStudents.length}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {shsConfirmed} verified enrolled
                  </div>
                </div>
              </div>

              {/* Account Onboarding Status */}
              <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                <div className="flex items-center justify-between text-xs font-bold text-gray-600 mb-2">
                  <span>Mobile Account Setup Progress</span>
                  <span>
                    {allStudents.length > 0
                      ? Math.round(
                          ((allStudents.length -
                            allStudents.filter((s) => s.isProfileComplete === false).length) /
                            allStudents.length) *
                            100
                        )
                      : 100}
                    % Completed
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="bg-emerald-500 h-2.5 rounded-full transition-all"
                    style={{
                      width: `${
                        allStudents.length > 0
                          ? Math.round(
                              ((allStudents.length -
                                allStudents.filter((s) => s.isProfileComplete === false).length) /
                                allStudents.length) *
                                100
                            )
                          : 100
                      }%`,
                    }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500 mt-2">
                  <span>
                    ✓ {allStudents.filter((s) => s.isProfileComplete !== false).length} profiles completed
                  </span>
                  <span>
                    ⏳ {allStudents.filter((s) => s.isProfileComplete === false).length} first-login pending
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="px-6 py-4 bg-gray-50/80 border-t border-gray-100 flex items-center justify-between">
            <span className="text-xs text-gray-500">Official student records synced from Registrar</span>
            <button
              onClick={() => onNavigate('active')}
              className="px-3 py-1.5 bg-[#001A4D] text-white rounded-lg text-xs font-bold hover:bg-[#0E4EBD] transition-colors cursor-pointer"
            >
              Browse Active Directory →
            </button>
          </div>
        </div>

        {/* Recent Activity Feed */}
        <div className="lg:col-span-5 bg-white border border-[#E0E0E0] rounded-xl overflow-hidden shadow-xs flex flex-col">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="font-bold text-[#001A4D]">Recent Account Activity</h3>
          </div>

          <div className="p-6 flex-1">
            <div className="space-y-3">
              {recentActivity.slice(0, 5).map((activity, index) => (
                <div key={index} className="flex items-start gap-3">
                  <div
                    className={`w-2 h-2 rounded-full mt-1.5 ${
                      activity.type === 'approved' ? 'bg-green-500' : 'bg-blue-500'
                    }`}
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-[#001A4D]">{activity.action}</div>
                    <div className="text-xs text-gray-500">{activity.time}</div>
                  </div>
                </div>
              ))}
              {recentActivity.length === 0 && (
                <div className="text-sm text-gray-500 text-center py-6">No recent activity.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
