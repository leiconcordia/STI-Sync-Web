import { Megaphone, Pin, Plus, Users, Building2 } from "lucide-react";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";

const announcements = [
  {
    id: 1,
    title: "Reminder: Event Proposal Deadline",
    content: "All event proposals for June must be submitted by May 31, 2026. Late submissions will not be processed.",
    author: "SAO Office",
    date: "May 31, 2026",
    time: "9:00 AM",
    priority: "Important",
    audience: "All Organizations",
    pinned: true,
  },
  {
    id: 2,
    title: "Updated Financial Liquidation Guidelines",
    content: "Please review the updated guidelines for financial liquidations. All receipts must be scanned in high resolution and clearly legible.",
    author: "SAO Office",
    date: "May 30, 2026",
    time: "2:30 PM",
    priority: "Important",
    audience: "All Organizations",
    pinned: true,
  },
  {
    id: 3,
    title: "Campus Activity Day - June 15, 2026",
    content: "Save the date! Campus Activity Day will feature all student organizations showcasing their activities and achievements.",
    author: "SAO Office",
    date: "May 29, 2026",
    time: "11:15 AM",
    priority: "Normal",
    audience: "Campus-Wide",
    pinned: false,
  },
  {
    id: 4,
    title: "JPIA Leadership Summit Approved",
    content: "The JPIA Leadership Summit scheduled for June 15, 2026 has been approved. Please coordinate with the SAO office for final preparations.",
    author: "SAO Office",
    date: "May 28, 2026",
    time: "3:45 PM",
    priority: "Normal",
    audience: "JPIA",
    pinned: false,
  },
  {
    id: 5,
    title: "System Maintenance Notice",
    content: "STI Sync will undergo scheduled maintenance on June 1, 2026 from 12:00 AM to 4:00 AM. The system will be unavailable during this period.",
    author: "SAO Office",
    date: "May 27, 2026",
    time: "4:00 PM",
    priority: "Urgent",
    audience: "Campus-Wide",
    pinned: false,
  },
];

export function Announcements() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#001A4D]">Announcements</h2>
          <p className="text-gray-500 text-sm">Create and manage campus-wide announcements</p>
        </div>
        <Button className="bg-[#001A4D] hover:bg-[#0E4EBD] text-white">
          <Plus className="w-4 h-4 mr-2 text-[#FFC107]" />
          Post Announcement
        </Button>
      </div>

      {/* Announcements Feed */}
      <div className="space-y-4">
        {announcements.map((announcement) => (
          <Card 
            key={announcement.id} 
            className={`border-[#E0E0E0] hover:shadow-md transition-shadow ${
              announcement.pinned ? "border-t-2 border-t-[#FFC107]" : ""
            }`}
          >
            <CardContent className="p-6">
              {/* Header */}
              <div className="flex items-start gap-4 mb-4">
                {/* Avatar */}
                <div className="w-12 h-12 bg-[#001A4D] rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 ring-2 ring-[#FFC107]">
                  SAO
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        {announcement.pinned && (
                          <Pin className="w-4 h-4 text-[#FFC107] fill-[#FFC107]" />
                        )}
                        <h3 className="font-bold text-[#001A4D] text-lg">{announcement.title}</h3>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <span className="font-medium">{announcement.author}</span>
                        <span>•</span>
                        <span>{announcement.date} at {announcement.time}</span>
                      </div>
                    </div>

                    {/* Priority Badge */}
                    <div>
                      {announcement.priority === "Urgent" && (
                        <Badge className="bg-gradient-to-r from-[#EF4444] to-[#F97316] text-white border-0">
                          Urgent
                        </Badge>
                      )}
                      {announcement.priority === "Important" && (
                        <Badge className="bg-[#FFC107] text-[#001A4D] hover:bg-[#FFC107]">
                          Important
                        </Badge>
                      )}
                      {announcement.priority === "Normal" && (
                        <Badge variant="outline" className="border-gray-300 text-gray-600">
                          Normal
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Content */}
                  <p className="text-gray-700 mb-4 leading-relaxed">
                    {announcement.content}
                  </p>

                  {/* Footer */}
                  <div className="flex items-center justify-between">
                    {/* Audience */}
                    <div className="flex items-center gap-2">
                      {announcement.audience === "Campus-Wide" ? (
                        <>
                          <Users className="w-4 h-4 text-[#0E4EBD]" />
                          <Badge className="bg-[#001A4D] text-white hover:bg-[#001A4D]">
                            Campus-Wide
                          </Badge>
                        </>
                      ) : announcement.audience === "All Organizations" ? (
                        <>
                          <Building2 className="w-4 h-4 text-[#0E4EBD]" />
                          <Badge className="bg-[#0E4EBD] text-white hover:bg-[#0E4EBD]">
                            All Organizations
                          </Badge>
                        </>
                      ) : (
                        <>
                          <Building2 className="w-4 h-4 text-[#1E70E8]" />
                          <Badge className="bg-[#1E70E8] text-white hover:bg-[#1E70E8]">
                            {announcement.audience}
                          </Badge>
                        </>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="ghost" className="text-[#0E4EBD] hover:text-[#1E70E8] hover:bg-[#0E4EBD]/10">
                        Edit
                      </Button>
                      {!announcement.pinned && (
                        <Button size="sm" variant="ghost" className="text-[#FFC107] hover:text-[#FFD54F] hover:bg-[#FFC107]/10">
                          <Pin className="w-4 h-4 mr-1" />
                          Pin
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Empty State (hidden when there are announcements) */}
      {announcements.length === 0 && (
        <Card className="border-[#E0E0E0]">
          <CardContent className="p-12 text-center">
            <Megaphone className="w-16 h-16 text-[#0E4EBD] mx-auto mb-4 opacity-50" />
            <h3 className="text-xl font-bold text-[#001A4D] mb-2">No Announcements Yet</h3>
            <p className="text-gray-500 mb-4">Create your first announcement to notify students and organizations.</p>
            <Button className="bg-[#001A4D] hover:bg-[#0E4EBD] text-white">
              <Plus className="w-4 h-4 mr-2 text-[#FFC107]" />
              Post Announcement
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
