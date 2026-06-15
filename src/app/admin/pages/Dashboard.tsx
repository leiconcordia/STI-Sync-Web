import { CalendarCheck, Receipt, Building2, BarChart3, Shield, TrendingUp } from "lucide-react";
import { MetricCard } from "../components/dashboard/MetricCard";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Progress } from "../../components/ui/progress";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

const chartData = [
  { id: "mon", day: "Mon", events: 12, scans: 245 },
  { id: "tue", day: "Tue", events: 8, scans: 180 },
  { id: "wed", day: "Wed", events: 15, scans: 320 },
  { id: "thu", day: "Thu", events: 10, scans: 220 },
  { id: "fri", day: "Fri", events: 18, scans: 410 },
  { id: "sat", day: "Sat", events: 6, scans: 95 },
  { id: "sun", day: "Sun", events: 4, scans: 60 },
];

const pendingApprovals = [
  { id: 1, type: "Event Proposal", title: "Annual Leadership Summit 2026", org: "JPIA", date: "May 28, 2026", urgency: "red" },
  { id: 2, type: "Liquidation", title: "Q1 Financial Report", org: "CSS", date: "May 29, 2026", urgency: "amber" },
  { id: 3, type: "Event Proposal", title: "Tech Talks Series", org: "ACSS", date: "May 30, 2026", urgency: "green" },
  { id: 4, type: "Student Registration", title: "New Member Applications", org: "JMAP", date: "May 31, 2026", urgency: "amber" },
];

const organizations = [
  { id: 1, name: "JPIA", fullName: "Junior Philippine Institute of Accountants", events: 8, total: 12, progress: 67 },
  { id: 2, name: "CSS", fullName: "Computer Science Society", events: 15, total: 18, progress: 83 },
  { id: 3, name: "ACSS", fullName: "Association of Computer Science Students", events: 10, total: 15, progress: 67 },
  { id: 4, name: "JMAP", fullName: "Junior Marketing Association of the Philippines", events: 5, total: 10, progress: 50 },
];

export function Dashboard() {
  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="relative bg-gradient-to-r from-[#0E4EBD] to-[#1E70E8] rounded-2xl p-8 text-white overflow-hidden">
        <div className="absolute left-0 top-0 bottom-0 w-2 bg-[#FFC107]" />
        <div className="relative z-10">
          <h2 className="text-2xl font-bold mb-2">Good morning, Maria.</h2>
          <p className="text-white/90">Here's a full overview of STI College Ormoc student organization activities.</p>
        </div>
        <Shield className="absolute right-8 top-1/2 -translate-y-1/2 w-32 h-32 opacity-10" />
      </div>

      {/* Top Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="Pending Event Approvals"
          value={5}
          icon={CalendarCheck}
          gradient="blue"
          change="+2 since yesterday"
          badge={
            <span className="px-2 py-1 bg-[#FFC107] text-[#001A4D] rounded-full text-xs font-semibold">
              Pending
            </span>
          }
        />
        <MetricCard
          title="Pending Liquidations"
          value={3}
          icon={Receipt}
          gradient="blue"
          change="+1 this week"
          badge={
            <span className="px-2 py-1 bg-[#FFC107] text-[#001A4D] rounded-full text-xs font-semibold">
              Action Needed
            </span>
          }
        />
        <MetricCard
          title="Active Organizations"
          value={24}
          icon={Building2}
          gradient="green"
          change="+2 vs last semester"
          trending="up"
        />
        <MetricCard
          title="Events This Month"
          value={42}
          icon={BarChart3}
          gradient="gold"
          change="12 currently ongoing"
          badge={
            <span className="px-2 py-1 bg-[#FFC107]/20 text-white rounded-full text-xs font-semibold">
              Live
            </span>
          }
        />
      </div>

      {/* Three Column Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Pending Approvals Queue */}
        <Card className="lg:col-span-5 border-[#E0E0E0]">
          <CardHeader>
            <CardTitle className="text-[#001A4D]">Pending Approvals Queue</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingApprovals.map((item) => (
              <div key={item.id} className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-lg transition-colors">
                <div className={`w-2 h-2 rounded-full ${
                  item.urgency === "red" ? "bg-red-500" : 
                  item.urgency === "amber" ? "bg-[#FFC107]" : 
                  "bg-green-500"
                }`} />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[#001A4D] text-sm">{item.title}</div>
                  <div className="text-xs text-gray-500">{item.org} · {item.date}</div>
                </div>
                <Button size="sm" className="bg-[#1E70E8] hover:bg-[#0E4EBD] text-white">
                  Review
                </Button>
              </div>
            ))}
            <Button variant="link" className="text-[#FFC107] hover:text-[#FFD54F] w-full mt-2">
              View All →
            </Button>
          </CardContent>
        </Card>

        {/* Organization Activity */}
        <Card className="lg:col-span-4 border-[#E0E0E0]">
          <CardHeader>
            <CardTitle className="text-[#001A4D]">Organization Activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {organizations.map((org) => (
              <div key={org.id}>
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-[#001A4D] rounded-full flex items-center justify-center text-white font-bold text-sm">
                    {org.name}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-[#001A4D] text-sm">{org.name}</div>
                    <div className="text-xs text-gray-500">{org.events} / {org.total} events</div>
                  </div>
                </div>
                <Progress
                  value={org.progress}
                  className="h-2 bg-[#2C65CF]/30"
                  style={{
                    "--progress-background": "#0C3C8A"
                  } as React.CSSProperties}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card className="lg:col-span-3 border-[#E0E0E0]">
          <CardHeader>
            <CardTitle className="text-[#001A4D]">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button className="w-full bg-[#001A4D] hover:bg-[#0E4EBD] text-white justify-start">
              <TrendingUp className="w-4 h-4 mr-2 text-[#FFC107]" />
              Generate Master Report
            </Button>
            <Button variant="outline" className="w-full border-[#0E4EBD] text-[#0E4EBD] hover:bg-[#E0E0E0]/50 justify-start">
              <CalendarCheck className="w-4 h-4 mr-2" />
              View All Events
            </Button>
            <Button variant="outline" className="w-full border-[#0E4EBD] text-[#0E4EBD] hover:bg-[#E0E0E0]/50 justify-start">
              <Building2 className="w-4 h-4 mr-2" />
              Manage Organizations
            </Button>
            <Button variant="outline" className="w-full border-[#0E4EBD] text-[#0E4EBD] hover:bg-[#E0E0E0]/50 justify-start">
              <Receipt className="w-4 h-4 mr-2" />
              Review Liquidations
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Campus Activity Chart */}
      <Card className="border-[#E0E0E0]">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-[#001A4D]">Campus Activity</CardTitle>
            <div className="flex gap-2">
              <Button size="sm" className="bg-[#001A4D] text-white hover:bg-[#0E4EBD]">
                This Week
              </Button>
              <Button size="sm" variant="ghost" className="text-gray-500">
                This Month
              </Button>
              <Button size="sm" variant="ghost" className="text-gray-500">
                This Semester
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} id="dashboard-activity-chart">
              <CartesianGrid key="grid" strokeDasharray="3 3" stroke="#E0E0E0" />
              <XAxis key="xaxis" dataKey="day" stroke="#666" />
              <YAxis key="yaxis" stroke="#666" />
              <Tooltip key="tooltip" />
              <Legend key="legend" />
              <Bar key="events-bar" dataKey="events" fill="#0E4EBD" name="Events Held" radius={[4, 4, 0, 0]} />
              <Bar key="scans-bar" dataKey="scans" fill="#FFC107" name="Total Scans" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
