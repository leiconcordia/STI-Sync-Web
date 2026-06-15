import { CheckCircle2, XCircle, AlertCircle, UserCheck, TrendingUp } from "lucide-react";
import { MetricCard } from "../components/dashboard/MetricCard";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const chartData = [
  { id: "event-1", event: "Leadership Summit", registered: 200, checkedIn: 178, absent: 22 },
  { id: "event-2", event: "Tech Talks", registered: 85, checkedIn: 82, absent: 3 },
  { id: "event-3", event: "Blood Drive", registered: 120, checkedIn: 98, absent: 22 },
  { id: "event-4", event: "Marketing Workshop", registered: 65, checkedIn: 61, absent: 4 },
];

const attendanceRecords = [
  { id: 1, studentId: "2022-001234", name: "Juan Dela Cruz", org: "JPIA", event: "Leadership Summit", checkIn: "8:45 AM", checkOut: "4:30 PM", status: "Complete" },
  { id: 2, studentId: "2022-001456", name: "Maria Santos", org: "CSS", event: "Tech Talks", checkIn: "9:00 AM", checkOut: "12:00 PM", status: "Complete" },
  { id: 3, studentId: "2022-002345", name: "Pedro Garcia", org: "RCY", event: "Blood Drive", checkIn: "10:15 AM", checkOut: "—", status: "Checked In" },
  { id: 4, studentId: "2022-003456", name: "Ana Reyes", org: "JMAP", event: "Marketing Workshop", checkIn: "—", checkOut: "—", status: "Absent" },
  { id: 5, studentId: "2022-004567", name: "Carlos Lopez", org: "ACSS", event: "Leadership Summit", checkIn: "8:30 AM", checkOut: "4:35 PM", status: "Flagged" },
];

export function AttendanceMonitoring() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-[#001A4D]">Attendance Monitoring</h2>
        <p className="text-gray-500 text-sm">Track and monitor event attendance via QR code scanning</p>
      </div>

      {/* Summary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <MetricCard
          title="Total Registered"
          value={470}
          icon={UserCheck}
          gradient="blue"
          change="Across 4 events"
        />
        <MetricCard
          title="Checked In"
          value={419}
          icon={CheckCircle2}
          gradient="green"
          change="89% attendance rate"
          trending="up"
        />
        <MetricCard
          title="Checked Out"
          value={395}
          icon={CheckCircle2}
          gradient="blue"
          change="94% completion"
        />
        <MetricCard
          title="Absent"
          value={51}
          icon={XCircle}
          gradient="red-orange"
          change="11% no-show rate"
        />
        <MetricCard
          title="Flagged"
          value={8}
          icon={AlertCircle}
          gradient="gold"
          badge={
            <span className="px-2 py-1 bg-[#FFC107] text-[#001A4D] rounded-full text-xs font-semibold">
              Review
            </span>
          }
        />
      </div>

      {/* Attendance Overview Chart */}
      <Card className="border-[#E0E0E0]">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-[#001A4D]">Attendance Overview by Event</CardTitle>
            <div className="flex gap-2">
              <Button size="sm" className="bg-[#001A4D] text-white hover:bg-[#0E4EBD]">
                Today
              </Button>
              <Button size="sm" variant="ghost" className="text-gray-500">
                This Week
              </Button>
              <Button size="sm" variant="ghost" className="text-gray-500">
                This Month
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} id="attendance-overview-chart">
              <CartesianGrid key="grid" strokeDasharray="3 3" stroke="#E0E0E0" />
              <XAxis key="xaxis" dataKey="event" stroke="#666" />
              <YAxis key="yaxis" stroke="#666" />
              <Tooltip key="tooltip" />
              <Bar key="checkedIn-bar" dataKey="checkedIn" fill="#0E4EBD" name="Checked In" radius={[4, 4, 0, 0]} />
              <Bar key="absent-bar" dataKey="absent" fill="#EF4444" name="Absent" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Attendance Table */}
      <Card className="border-[#E0E0E0]">
        <CardHeader>
          <CardTitle className="text-[#001A4D]">Recent Attendance Records</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="font-bold text-[#001A4D]">Student ID</TableHead>
                <TableHead className="font-bold text-[#001A4D]">Name</TableHead>
                <TableHead className="font-bold text-[#001A4D]">Organization</TableHead>
                <TableHead className="font-bold text-[#001A4D]">Event</TableHead>
                <TableHead className="font-bold text-[#001A4D]">Check In</TableHead>
                <TableHead className="font-bold text-[#001A4D]">Check Out</TableHead>
                <TableHead className="font-bold text-[#001A4D]">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {attendanceRecords.map((record) => (
                <TableRow key={record.id} className="hover:bg-[#1E70E8]/8">
                  <TableCell className="font-medium">{record.studentId}</TableCell>
                  <TableCell>{record.name}</TableCell>
                  <TableCell>
                    <Badge className="bg-[#0E4EBD] text-white hover:bg-[#0E4EBD]">
                      {record.org}
                    </Badge>
                  </TableCell>
                  <TableCell>{record.event}</TableCell>
                  <TableCell>{record.checkIn}</TableCell>
                  <TableCell>{record.checkOut}</TableCell>
                  <TableCell>
                    {record.status === "Complete" && (
                      <Badge className="bg-gradient-to-r from-[#22C55E] to-[#16A34A] text-white border-0">
                        Complete
                      </Badge>
                    )}
                    {record.status === "Checked In" && (
                      <Badge className="bg-[#0E4EBD] text-white hover:bg-[#0E4EBD]">
                        Checked In
                      </Badge>
                    )}
                    {record.status === "Absent" && (
                      <Badge className="bg-gradient-to-r from-[#EF4444] to-[#F97316] text-white border-0">
                        Absent
                      </Badge>
                    )}
                    {record.status === "Flagged" && (
                      <Badge className="bg-[#FFC107] text-[#001A4D] hover:bg-[#FFC107]">
                        Flagged
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Flagged Entries */}
      <Card className="border-l-2 border-[#FFC107] bg-[#FFC107]/15">
        <CardContent className="p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-[#FFC107] mt-0.5" />
            <div className="flex-1">
              <h3 className="font-bold text-[#001A4D] mb-1">8 Flagged Entries Require Review</h3>
              <p className="text-sm text-gray-700 mb-3">
                These attendance records have anomalies such as duplicate scans, late check-ins, or missing check-outs.
              </p>
              <Button className="bg-[#0E4EBD] hover:bg-[#1E70E8] text-white">
                Review Flagged Entries
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
