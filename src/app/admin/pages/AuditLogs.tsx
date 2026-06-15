import { Shield, AlertTriangle, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";

const auditLogs = [
  {
    id: 1,
    timestamp: "May 31, 2026 10:45 AM",
    user: "Maria Santos (SAO Adviser)",
    action: "Approved Event Proposal",
    actionType: "Event Actions",
    details: "Leadership Summit 2026 - JPIA",
    ipAddress: "192.168.1.45",
  },
  {
    id: 2,
    timestamp: "May 31, 2026 10:30 AM",
    user: "Maria Santos (SAO Adviser)",
    action: "Approved Liquidation",
    actionType: "Financial Actions",
    details: "Q1 2026 Financial Report - CSS",
    ipAddress: "192.168.1.45",
  },
  {
    id: 3,
    timestamp: "May 31, 2026 9:15 AM",
    user: "Maria Santos (SAO Adviser)",
    action: "Updated Student Record",
    actionType: "Account Actions",
    details: "Changed status for Juan Dela Cruz (2022-001234)",
    ipAddress: "192.168.1.45",
  },
  {
    id: 4,
    timestamp: "May 31, 2026 8:30 AM",
    user: "Maria Santos (SAO Adviser)",
    action: "Login",
    actionType: "Login Activity",
    details: "Successful login to SAO Admin Panel",
    ipAddress: "192.168.1.45",
  },
  {
    id: 5,
    timestamp: "May 30, 2026 4:20 PM",
    user: "Maria Santos (SAO Adviser)",
    action: "Generated Report",
    actionType: "Report Generation",
    details: "Event Summary Report - May 2026",
    ipAddress: "192.168.1.45",
  },
  {
    id: 6,
    timestamp: "May 30, 2026 3:50 PM",
    user: "Maria Santos (SAO Adviser)",
    action: "Rejected Event Proposal",
    actionType: "Event Actions",
    details: "Beach Party Fundraiser - DGS",
    ipAddress: "192.168.1.45",
  },
  {
    id: 7,
    timestamp: "May 30, 2026 2:15 PM",
    user: "System",
    action: "Failed Login Attempt",
    actionType: "Login Activity",
    details: "Multiple failed login attempts detected",
    ipAddress: "203.177.45.123",
    flagged: true,
  },
  {
    id: 8,
    timestamp: "May 30, 2026 11:00 AM",
    user: "Maria Santos (SAO Adviser)",
    action: "Created Organization",
    actionType: "Account Actions",
    details: "New organization: Environmental Club",
    ipAddress: "192.168.1.45",
  },
];

export function AuditLogs() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#001A4D]">Audit Logs</h2>
          <p className="text-gray-500 text-sm">Monitor all system activities and administrative actions</p>
        </div>
        <Button variant="outline" className="border-[#0E4EBD] text-[#0E4EBD]">
          <Shield className="w-4 h-4 mr-2" />
          Export Logs
        </Button>
      </div>

      {/* Suspicious Activity Alert */}
      <Card className="border-l-2 border-[#FFC107] bg-[#FFC107]/15">
        <CardContent className="p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-[#FFC107] mt-0.5" />
            <div className="flex-1">
              <h3 className="font-bold text-[#001A4D] mb-1">Suspicious Activity Detected</h3>
              <p className="text-sm text-gray-700 mb-3">
                Multiple failed login attempts from IP address 203.177.45.123 on May 30, 2026. This activity has been flagged for review.
              </p>
              <Button className="bg-[#0E4EBD] hover:bg-[#1E70E8] text-white">
                Review Activity
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Search and Filter */}
      <Card className="border-[#E0E0E0]">
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                type="search"
                placeholder="Search logs by user, action, or details..."
                className="pl-9 border-[#E0E0E0] focus-visible:ring-[#1E70E8]"
              />
            </div>
            <Button variant="outline" className="border-[#E0E0E0]">
              Filter by Action Type
            </Button>
            <Button variant="outline" className="border-[#E0E0E0]">
              Date Range
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card className="border-[#E0E0E0]">
          <CardContent className="p-4">
            <div className="text-sm text-gray-600 mb-1">Total Actions</div>
            <div className="text-2xl font-bold text-[#001A4D]">2,847</div>
          </CardContent>
        </Card>
        <Card className="border-[#E0E0E0]">
          <CardContent className="p-4">
            <div className="text-sm text-gray-600 mb-1">Event Actions</div>
            <div className="text-2xl font-bold text-[#0E4EBD]">456</div>
          </CardContent>
        </Card>
        <Card className="border-[#E0E0E0]">
          <CardContent className="p-4">
            <div className="text-sm text-gray-600 mb-1">Financial Actions</div>
            <div className="text-2xl font-bold text-[#22C55E]">189</div>
          </CardContent>
        </Card>
        <Card className="border-[#E0E0E0]">
          <CardContent className="p-4">
            <div className="text-sm text-gray-600 mb-1">Login Activity</div>
            <div className="text-2xl font-bold text-gray-600">1,234</div>
          </CardContent>
        </Card>
        <Card className="border-[#E0E0E0]">
          <CardContent className="p-4">
            <div className="text-sm text-gray-600 mb-1">Flagged Events</div>
            <div className="text-2xl font-bold text-[#FFC107]">12</div>
          </CardContent>
        </Card>
      </div>

      {/* Audit Log Table */}
      <Card className="border-[#E0E0E0]">
        <CardHeader>
          <CardTitle className="text-[#001A4D]">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="font-bold text-[#001A4D]">Timestamp</TableHead>
                <TableHead className="font-bold text-[#001A4D]">User</TableHead>
                <TableHead className="font-bold text-[#001A4D]">Action</TableHead>
                <TableHead className="font-bold text-[#001A4D]">Action Type</TableHead>
                <TableHead className="font-bold text-[#001A4D]">Details</TableHead>
                <TableHead className="font-bold text-[#001A4D]">IP Address</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {auditLogs.map((log) => (
                <TableRow 
                  key={log.id} 
                  className={`${log.flagged ? "bg-[#FFC107]/10" : "hover:bg-[#0E4EBD]/5"}`}
                >
                  <TableCell className="font-medium text-sm">{log.timestamp}</TableCell>
                  <TableCell className="text-sm">{log.user}</TableCell>
                  <TableCell className="font-semibold text-[#001A4D] text-sm">
                    {log.flagged && <AlertTriangle className="w-4 h-4 text-[#FFC107] inline mr-1" />}
                    {log.action}
                  </TableCell>
                  <TableCell>
                    {log.actionType === "Event Actions" && (
                      <Badge className="bg-gradient-to-r from-[#0E4EBD] to-[#1E70E8] text-white border-0 text-xs">
                        Event Actions
                      </Badge>
                    )}
                    {log.actionType === "Financial Actions" && (
                      <Badge className="bg-gradient-to-r from-[#22C55E] to-[#16A34A] text-white border-0 text-xs">
                        Financial
                      </Badge>
                    )}
                    {log.actionType === "Account Actions" && (
                      <Badge className="bg-[#1E70E8] text-white hover:bg-[#1E70E8] text-xs">
                        Account
                      </Badge>
                    )}
                    {log.actionType === "Login Activity" && (
                      <Badge variant="outline" className="border-gray-300 text-gray-600 text-xs">
                        Login
                      </Badge>
                    )}
                    {log.actionType === "Report Generation" && (
                      <Badge className="bg-[#FFC107] text-[#001A4D] hover:bg-[#FFC107] text-xs">
                        Report
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">{log.details}</TableCell>
                  <TableCell className="text-sm font-mono text-gray-500">{log.ipAddress}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
