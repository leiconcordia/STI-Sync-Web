import { Calendar, Receipt, Users, BarChart3, MapPin, Clock, CheckCircle, Eye } from 'lucide-react';

export default function OfficerDashboardPage() {
  const upcomingEvents = [
    { id: 1, name: 'IT Guild General Assembly', date: 'Jun 15, 2026', time: '8:00 AM', venue: 'AVR Hall', status: 'Approved', statusColor: 'bg-[#639922]', dotColor: 'bg-[#7F77DD]' },
    { id: 2, name: 'Leadership Summit 2026', date: 'Jun 22, 2026', time: '9:00 AM', venue: 'Conference Room A', status: 'Pending', statusColor: 'bg-[#BA7517]', dotColor: 'bg-[#0E4EBD]' },
    { id: 3, name: 'Team Building Activity', date: 'Jul 5, 2026', time: '1:00 PM', venue: 'Beach Resort', status: 'Draft', statusColor: 'bg-[#888780]', dotColor: 'bg-[#F97316]' },
  ];

  const pendingTasks = [
    { id: 1, task: 'Submit liquidation for Acquaintance Party', dueDate: 'Overdue · 3 days ago', isDueDays: true },
    { id: 2, task: 'Upload receipts for Team Building', dueDate: 'Due in 2 days', isDueDays: false },
    { id: 3, task: 'Review attendance report — JS Night', dueDate: 'Due in 5 days', isDueDays: false },
  ];

  const recentScans = [
    { id: 1, name: 'Juan Dela Cruz', event: 'IT Guild GenAss', scanType: 'Check-In', time: '2 min ago', verified: true },
    { id: 2, name: 'Maria Santos', event: 'IT Guild GenAss', scanType: 'Check-In', time: '5 min ago', verified: true },
    { id: 3, name: 'Pedro Garcia', event: 'Leadership Summit', scanType: 'Check-Out', time: '12 min ago', verified: true },
    { id: 4, name: 'Ana Reyes', event: 'Team Building', scanType: 'Check-In', time: '15 min ago', verified: false },
    { id: 5, name: 'Carlos Lopez', event: 'IT Guild GenAss', scanType: 'Check-In', time: '20 min ago', verified: true },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-[#EEEDFE] rounded-xl p-6 flex items-center justify-between">
        <div>
          <h2 className="text-[#001A4D] text-[20px] font-bold mb-1">Good morning, Juan Dela Cruz 👋</h2>
          <p className="text-[#888780] text-[14px]">Here's what's happening with STI IT Guild today.</p>
        </div>
        <div className="w-12 h-12 bg-[#7F77DD]/20 rounded-lg flex items-center justify-center">
          <Calendar className="w-6 h-6 text-[#7F77DD]" />
        </div>
      </div>

      {/* Metric Summary Row */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white border border-[#E0E0E0] rounded-xl p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[#888780] text-[13px]">Upcoming Events</span>
            <Calendar className="w-5 h-5 text-[#7F77DD]" />
          </div>
          <div className="text-[#7F77DD] text-[24px] font-bold">8</div>
        </div>

        <div className="bg-white border border-[#E0E0E0] rounded-xl p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[#888780] text-[13px]">Pending Liquidations</span>
            <Receipt className="w-5 h-5 text-[#BA7517]" />
          </div>
          <div className="text-[#BA7517] text-[24px] font-bold">3</div>
        </div>

        <div className="bg-white border border-[#E0E0E0] rounded-xl p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[#888780] text-[13px]">Total Members</span>
            <Users className="w-5 h-5 text-[#888780]" />
          </div>
          <div className="text-[#001A4D] text-[24px] font-bold">156</div>
        </div>

        <div className="bg-white border border-[#E0E0E0] rounded-xl p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[#888780] text-[13px]">Events This Month</span>
            <BarChart3 className="w-5 h-5 text-[#0E4EBD]" />
          </div>
          <div className="text-[#0E4EBD] text-[24px] font-bold">12</div>
        </div>
      </div>

      {/* Two-column section */}
      <div className="grid grid-cols-12 gap-6">
        {/* Upcoming Events */}
        <div className="col-span-7 bg-white border border-[#E0E0E0] rounded-xl overflow-hidden">
          <div className="p-5 border-b border-[#E0E0E0] flex items-center justify-between">
            <h3 className="text-[#001A4D] text-[16px] font-bold">Upcoming Events</h3>
            <button className="text-[#7F77DD] text-[13px] font-medium hover:underline">View All Events</button>
          </div>
          <div className="p-5 space-y-4">
            {upcomingEvents.map((event) => (
              <div key={event.id} className="flex items-start gap-3 pb-4 border-b border-[#E0E0E0] last:border-0 last:pb-0">
                <div className={`w-2 h-2 ${event.dotColor} rounded-full mt-2`} />
                <div className="flex-1">
                  <h4 className="text-[#001A4D] text-[14px] font-bold mb-1">{event.name}</h4>
                  <div className="flex items-center gap-4 text-[#888780] text-[12px]">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>{event.date} · {event.time}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      <span>{event.venue}</span>
                    </div>
                  </div>
                </div>
                <span className={`px-2 py-1 ${event.statusColor} text-white rounded text-[11px] font-medium`}>
                  {event.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Pending Tasks */}
        <div className="col-span-5 bg-white border border-[#E0E0E0] rounded-xl overflow-hidden">
          <div className="p-5 border-b border-[#E0E0E0]">
            <h3 className="text-[#001A4D] text-[16px] font-bold">Pending Tasks</h3>
          </div>
          <div className="p-5 space-y-3">
            {pendingTasks.map((task) => (
              <div key={task.id} className="flex items-start gap-3 pb-3 border-b border-[#E0E0E0] last:border-0 last:pb-0">
                <div className="w-5 h-5 border-2 border-[#888780] rounded-full mt-1 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-[#001A4D] text-[14px] font-bold mb-1">{task.task}</p>
                  <p className={`text-[12px] ${task.isDueDays ? 'text-[#E24B4A]' : 'text-[#888780]'}`}>
                    {task.dueDate}
                  </p>
                </div>
                <button className="px-3 py-1.5 bg-[#7F77DD] text-white rounded-lg text-[12px] font-medium hover:bg-[#7F77DD]/90">
                  Act
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Attendance Activity */}
      <div className="bg-white border border-[#E0E0E0] rounded-xl overflow-hidden">
        <div className="p-5 border-b border-[#E0E0E0] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="text-[#001A4D] text-[16px] font-bold">Recent Attendance Activity</h3>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-[#639922] rounded-full animate-pulse" />
              <span className="text-[#639922] text-[11px] font-medium">Live</span>
            </div>
          </div>
          <button className="text-[#7F77DD] text-[13px] font-medium hover:underline">View Full Logs</button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[#F8F8F8] border-b border-[#E0E0E0]">
              <tr>
                <th className="px-5 py-3 text-left text-[#888780] text-[12px] font-bold uppercase tracking-wider">Student</th>
                <th className="px-5 py-3 text-left text-[#888780] text-[12px] font-bold uppercase tracking-wider">Event</th>
                <th className="px-5 py-3 text-left text-[#888780] text-[12px] font-bold uppercase tracking-wider">Scan Type</th>
                <th className="px-5 py-3 text-left text-[#888780] text-[12px] font-bold uppercase tracking-wider">Timestamp</th>
                <th className="px-5 py-3 text-left text-[#888780] text-[12px] font-bold uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E0E0E0]">
              {recentScans.map((scan) => (
                <tr key={scan.id} className="hover:bg-[#EEEDFE] transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-[#7F77DD] rounded-full flex items-center justify-center text-white font-semibold text-xs">
                        {scan.name.split(' ').map(n => n[0]).join('')}
                      </div>
                      <span className="text-[#001A4D] text-[13px] font-medium">{scan.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-[#888780] text-[13px]">{scan.event}</td>
                  <td className="px-5 py-4">
                    <span className={`px-2 py-1 rounded text-[11px] font-medium ${
                      scan.scanType === 'Check-In' ? 'bg-[#639922] text-white' : 'bg-[#888780] text-white'
                    }`}>
                      {scan.scanType}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-[#888780] text-[13px]">{scan.time}</td>
                  <td className="px-5 py-4">
                    {scan.verified ? (
                      <CheckCircle className="w-5 h-5 text-[#639922]" />
                    ) : (
                      <Eye className="w-5 h-5 text-[#BA7517]" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
