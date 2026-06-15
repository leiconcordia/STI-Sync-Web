import { BarChart3, TrendingUp, FileText, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

const trendData = [
  { id: "jan", month: "Jan", events: 8, attendance: 180 },
  { id: "feb", month: "Feb", events: 12, attendance: 245 },
  { id: "mar", month: "Mar", events: 15, attendance: 320 },
  { id: "apr", month: "Apr", events: 18, attendance: 380 },
  { id: "may", month: "May", events: 22, attendance: 450 },
];

const budgetData = [
  { id: "jpia", org: "JPIA", allocated: 120000, spent: 98000 },
  { id: "css", org: "CSS", allocated: 150000, spent: 142000 },
  { id: "rcy", org: "RCY", allocated: 80000, spent: 75000 },
  { id: "acss", org: "ACSS", allocated: 110000, spent: 95000 },
  { id: "jmap", org: "JMAP", allocated: 90000, spent: 87000 },
];

const orgDistribution = [
  { id: "academic", name: "Academic", value: 45, color: "#0E4EBD" },
  { id: "civic", name: "Civic", value: 25, color: "#22C55E" },
  { id: "cultural", name: "Cultural", value: 20, color: "#FFC107" },
  { id: "sports", name: "Sports", value: 10, color: "#1E70E8" },
];

const reportTypes = [
  { id: 1, title: "Event Summary Report", icon: BarChart3, description: "Comprehensive overview of all events" },
  { id: 2, title: "Financial Report", icon: FileText, description: "Budget allocation and spending analysis" },
  { id: 3, title: "Attendance Report", icon: TrendingUp, description: "Student participation and attendance trends" },
  { id: 4, title: "Organization Report", icon: FileText, description: "Organization performance and compliance" },
];

export function ReportsAnalytics() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#001A4D]">Reports & Analytics</h2>
          <p className="text-gray-500 text-sm">Generate comprehensive reports and view analytics</p>
        </div>
        <Button className="bg-gradient-to-r from-[#22C55E] to-[#16A34A] hover:from-[#16A34A] hover:to-[#22C55E] text-white">
          <Download className="w-4 h-4 mr-2" />
          Download Report
        </Button>
      </div>

      {/* Report Type Selector */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {reportTypes.map((report) => {
          const Icon = report.icon;
          return (
            <Card 
              key={report.id}
              className="border-[#E0E0E0] hover:border-[#0E4EBD] hover:shadow-lg transition-all cursor-pointer group"
            >
              <CardContent className="p-6 text-center">
                <div className="w-12 h-12 bg-[#0E4EBD]/10 rounded-lg flex items-center justify-center mx-auto mb-4 group-hover:bg-[#0E4EBD] transition-colors">
                  <Icon className="w-6 h-6 text-[#0E4EBD] group-hover:text-white transition-colors" />
                </div>
                <h3 className="font-bold text-[#001A4D] mb-1">{report.title}</h3>
                <p className="text-xs text-gray-500">{report.description}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Event & Attendance Trends */}
      <Card className="border-[#E0E0E0]">
        <CardHeader>
          <CardTitle className="text-[#001A4D]">Event & Attendance Trends</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trendData} id="trend-chart">
              <CartesianGrid key="grid" strokeDasharray="3 3" stroke="#E0E0E0" />
              <XAxis key="xaxis" dataKey="month" stroke="#666" />
              <YAxis key="yaxis" stroke="#666" />
              <Tooltip key="tooltip" />
              <Legend key="legend" />
              <Line
                key="events-line"
                type="monotone"
                dataKey="events"
                stroke="#0E4EBD"
                strokeWidth={3}
                name="Events Held"
                dot={{ fill: "#0E4EBD", r: 4 }}
              />
              <Line
                key="attendance-line"
                type="monotone"
                dataKey="attendance"
                stroke="#FFC107"
                strokeWidth={3}
                name="Total Attendance"
                dot={{ fill: "#FFC107", r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Budget Analysis */}
        <Card className="border-[#E0E0E0]">
          <CardHeader>
            <CardTitle className="text-[#001A4D]">Budget vs Spending Analysis</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={budgetData} id="budget-chart">
                <CartesianGrid key="grid" strokeDasharray="3 3" stroke="#E0E0E0" />
                <XAxis key="xaxis" dataKey="org" stroke="#666" />
                <YAxis key="yaxis" stroke="#666" />
                <Tooltip key="tooltip" />
                <Legend key="legend" />
                <Bar key="allocated-bar" dataKey="allocated" fill="#0E4EBD" name="Allocated" radius={[4, 4, 0, 0]} />
                <Bar key="spent-bar" dataKey="spent" fill="#FFC107" name="Spent" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Organization Distribution */}
        <Card className="border-[#E0E0E0]">
          <CardHeader>
            <CardTitle className="text-[#001A4D]">Organization Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart id="org-distribution-chart">
                <Pie
                  key="org-pie"
                  data={orgDistribution}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${value}%`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {orgDistribution.map((entry) => (
                    <Cell key={`cell-${entry.id}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip key="tooltip" />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="border-[#E0E0E0] bg-gradient-to-br from-[#0E4EBD] to-[#1E70E8] text-white">
          <CardContent className="p-6">
            <div className="text-4xl font-bold mb-2">156</div>
            <div className="text-white/90 text-sm">Total Events This Year</div>
            <div className="text-white/70 text-xs mt-1">+24% vs last year</div>
          </CardContent>
        </Card>
        <Card className="border-[#E0E0E0] bg-gradient-to-br from-[#22C55E] to-[#16A34A] text-white">
          <CardContent className="p-6">
            <div className="text-4xl font-bold mb-2">8,450</div>
            <div className="text-white/90 text-sm">Total Attendance</div>
            <div className="text-white/70 text-xs mt-1">Avg 54 per event</div>
          </CardContent>
        </Card>
        <Card className="border-[#E0E0E0] bg-gradient-to-br from-[#FFC107] to-[#F59E0B] text-white">
          <CardContent className="p-6">
            <div className="text-4xl font-bold mb-2">₱1.2M</div>
            <div className="text-white/90 text-sm">Total Budget Allocated</div>
            <div className="text-white/70 text-xs mt-1">85% utilization rate</div>
          </CardContent>
        </Card>
        <Card className="border-[#E0E0E0] bg-gradient-to-br from-[#001A4D] to-[#0C3C8A] text-white">
          <CardContent className="p-6">
            <div className="text-4xl font-bold mb-2">92%</div>
            <div className="text-white/90 text-sm">Compliance Rate</div>
            <div className="text-white/70 text-xs mt-1">Across all organizations</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
