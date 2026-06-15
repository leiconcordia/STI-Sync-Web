import { useState } from "react";
import { CheckCircle2, XCircle, Clock, Calendar, Plus, Eye } from "lucide-react";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../components/ui/tabs";
import SaoEventCreationModal from "../components/SaoEventCreationModal";
import EventProposalReview from "../components/EventProposalReview";

const events = [
  {
    id: 1,
    name: "Annual Leadership Summit 2026",
    org: "JPIA",
    type: "Conference",
    date: "June 15, 2026",
    venue: "STI Auditorium",
    status: "Pending",
    submittedDate: "May 28, 2026",
    budget: "₱85,000",
  },
  {
    id: 2,
    name: "Tech Talks: AI & Machine Learning",
    org: "CSS",
    type: "Seminar",
    date: "June 8, 2026",
    venue: "Computer Lab 3",
    status: "Pending",
    submittedDate: "May 29, 2026",
    budget: "₱12,000",
  },
  {
    id: 3,
    name: "Blood Donation Drive",
    org: "RCY",
    type: "Community Service",
    date: "June 12, 2026",
    venue: "Main Lobby",
    status: "Pending",
    submittedDate: "May 30, 2026",
    budget: "₱8,500",
  },
  {
    id: 4,
    name: "Marketing Analytics Workshop",
    org: "JMAP",
    type: "Workshop",
    date: "June 20, 2026",
    venue: "Room 402",
    status: "Pending",
    submittedDate: "May 31, 2026",
    budget: "₱15,000",
  },
];

const approvedEvents = [
  {
    id: 5,
    name: "Programming Competition 2026",
    org: "ACSS",
    type: "Competition",
    date: "July 5, 2026",
    venue: "Computer Lab 1-2",
    status: "Approved",
    approvedDate: "May 25, 2026",
    budget: "₱45,000",
  },
];

const rejectedEvents = [
  {
    id: 6,
    name: "Beach Party Fundraiser",
    org: "DGS",
    type: "Social",
    date: "June 18, 2026",
    venue: "Off-Campus",
    status: "Rejected",
    rejectedDate: "May 27, 2026",
    reason: "Budget exceeded allocation, venue not within campus policy",
  },
];

export function EventApprovals() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#001A4D]">Event Approvals</h2>
          <p className="text-gray-500 text-sm">Review and approve event proposals from student organizations</p>
        </div>
        <Button
          onClick={() => setIsModalOpen(true)}
          className="bg-gradient-to-r from-[#001A4D] to-[#83358E] hover:from-[#001A4D]/90 hover:to-[#83358E]/90 text-white"
        >
          <Plus className="w-4 h-4 mr-2" />
          Create Event (SAO)
        </Button>
      </div>

      {/* Status Tabs */}
      <Tabs defaultValue="pending" className="w-full">
        <TabsList className="bg-white border border-[#E0E0E0]">
          <TabsTrigger 
            value="pending"
            className="data-[state=active]:bg-[#001A4D] data-[state=active]:text-white data-[state=active]:border-b-[3px] data-[state=active]:border-[#FFC107] relative"
          >
            Pending
            <Badge className="ml-2 bg-[#FFC107] text-[#001A4D] hover:bg-[#FFC107]">5</Badge>
          </TabsTrigger>
          <TabsTrigger 
            value="approved"
            className="data-[state=active]:bg-[#001A4D] data-[state=active]:text-white data-[state=active]:border-b-[3px] data-[state=active]:border-[#FFC107]"
          >
            Approved
            <Badge className="ml-2 bg-[#FFC107] text-[#001A4D] hover:bg-[#FFC107]">12</Badge>
          </TabsTrigger>
          <TabsTrigger 
            value="rejected"
            className="data-[state=active]:bg-[#001A4D] data-[state=active]:text-white data-[state=active]:border-b-[3px] data-[state=active]:border-[#FFC107]"
          >
            Rejected
            <Badge className="ml-2 bg-[#FFC107] text-[#001A4D] hover:bg-[#FFC107]">2</Badge>
          </TabsTrigger>
          <TabsTrigger 
            value="all"
            className="data-[state=active]:bg-[#001A4D] data-[state=active]:text-white data-[state=active]:border-b-[3px] data-[state=active]:border-[#FFC107]"
          >
            All Events
            <Badge className="ml-2 bg-[#FFC107] text-[#001A4D] hover:bg-[#FFC107]">19</Badge>
          </TabsTrigger>
        </TabsList>

        {/* Pending Events */}
        <TabsContent value="pending" className="space-y-4 mt-6">
          {events.map((event) => (
            <Card key={event.id} className="border-[#E0E0E0] hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="w-2 h-2 bg-[#0E4EBD] rounded-full mt-2" />
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-bold text-[#001A4D] text-lg">{event.name}</h3>
                        <p className="text-gray-500 text-sm">{event.org}</p>
                      </div>
                      <Badge className="bg-[#FFC107] text-[#001A4D] hover:bg-[#FFC107]">
                        Pending
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Calendar className="w-4 h-4 text-[#0E4EBD]" />
                        <span>{event.date}</span>
                      </div>
                      <div className="text-sm text-gray-600">
                        <span className="font-medium">Venue:</span> {event.venue}
                      </div>
                      <div className="text-sm text-gray-600">
                        <span className="font-medium">Type:</span> {event.type}
                      </div>
                      <div className="text-sm text-gray-600">
                        <span className="font-medium">Budget:</span> {event.budget}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button className="bg-gradient-to-r from-[#22C55E] to-[#16A34A] hover:from-[#16A34A] hover:to-[#22C55E] text-white">
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                        Approve
                      </Button>
                      <Button className="bg-gradient-to-r from-[#EF4444] to-[#F97316] hover:from-[#F97316] hover:to-[#EF4444] text-white">
                        <XCircle className="w-4 h-4 mr-2" />
                        Reject
                      </Button>
                      <Button variant="outline" className="border-[#0E4EBD] text-[#0E4EBD] hover:bg-[#E0E0E0]/50" onClick={() => setSelectedEvent(event)}>
                        <Eye className="w-4 h-4 mr-2" />
                        View Details
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* Approved Events */}
        <TabsContent value="approved" className="space-y-4 mt-6">
          {approvedEvents.map((event) => (
            <Card key={event.id} className="border-[#E0E0E0]">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="w-2 h-2 bg-green-500 rounded-full mt-2" />
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-bold text-[#001A4D] text-lg">{event.name}</h3>
                        <p className="text-gray-500 text-sm">{event.org}</p>
                      </div>
                      <Badge className="bg-gradient-to-r from-[#22C55E] to-[#16A34A] text-white border-0">
                        Approved
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Calendar className="w-4 h-4 text-green-600" />
                        <span>{event.date}</span>
                      </div>
                      <div className="text-sm text-gray-600">
                        <span className="font-medium">Venue:</span> {event.venue}
                      </div>
                      <div className="text-sm text-gray-600">
                        <span className="font-medium">Type:</span> {event.type}
                      </div>
                      <div className="text-sm text-gray-600">
                        <span className="font-medium">Approved:</span> {event.approvedDate}
                      </div>
                    </div>
                    <div>
                      <Button variant="outline" className="border-[#0E4EBD] text-[#0E4EBD] hover:bg-[#E0E0E0]/50" onClick={() => setSelectedEvent(event)}>
                        <Eye className="w-4 h-4 mr-2" />
                        View Details
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* Rejected Events */}
        <TabsContent value="rejected" className="space-y-4 mt-6">
          {rejectedEvents.map((event) => (
            <Card key={event.id} className="border-[#E0E0E0]">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="w-2 h-2 bg-red-500 rounded-full mt-2" />
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-bold text-[#001A4D] text-lg">{event.name}</h3>
                        <p className="text-gray-500 text-sm">{event.org}</p>
                      </div>
                      <Badge className="bg-gradient-to-r from-[#EF4444] to-[#F97316] text-white border-0">
                        Rejected
                      </Badge>
                    </div>

                    <div className="bg-red-50 border-l-2 border-red-500 p-4 mb-4 rounded">
                      <p className="text-sm text-gray-700">
                        <span className="font-medium">Rejection Reason:</span> {event.reason}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Calendar className="w-4 h-4 text-red-600" />
                        <span>{event.date}</span>
                      </div>
                      <div className="text-sm text-gray-600">
                        <span className="font-medium">Venue:</span> {event.venue}
                      </div>
                      <div className="text-sm text-gray-600">
                        <span className="font-medium">Type:</span> {event.type}
                      </div>
                      <div className="text-sm text-gray-600">
                        <span className="font-medium">Rejected:</span> {event.rejectedDate}
                      </div>
                    </div>
                    <div>
                      <Button variant="outline" className="border-[#0E4EBD] text-[#0E4EBD] hover:bg-[#E0E0E0]/50" onClick={() => setSelectedEvent(event)}>
                        <Eye className="w-4 h-4 mr-2" />
                        View Details
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* All Events */}
        <TabsContent value="all" className="space-y-4 mt-6">
          <p className="text-gray-500 text-center py-8">Showing all events across all statuses...</p>
        </TabsContent>
      </Tabs>

      {/* SAO Event Creation Modal */}
      <SaoEventCreationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />

      {/* Event Proposal Review */}
      {selectedEvent && (
        <EventProposalReview
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </div>
  );
}
