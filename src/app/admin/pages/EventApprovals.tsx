import { useState, useMemo, useEffect } from "react";
import { useOutletContext } from "react-router";
import { CheckCircle2, XCircle, Clock, Calendar, Plus, Eye, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../components/ui/tabs";
import { Input } from "../../components/ui/input";
import SaoEventCreationModal from "../components/SaoEventCreationModal";
import EventProposalReview from "../components/EventProposalReview";

import { useAllEvents } from "../../modules/events/hooks/useEventStream";
import { useOrganizationStream } from "../../modules/organizations/hooks/useOrganizationStream";
import { approveEvent, rejectEvent } from "../../modules/events/services/event.service";
import { useAdviserProfile } from "../../modules/auth/hooks/useAdviserProfile";
import type { EventDocument } from "../../modules/events/types/event.types";

const ITEMS_PER_PAGE = 10;

export function EventApprovals() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<EventDocument | null>(null);
  
  const { globalSearch } = useOutletContext<{ globalSearch: string }>();
  const searchQuery = globalSearch || "";

  const [activeTab, setActiveTab] = useState("pending");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  const { events, loading: eventsLoading } = useAllEvents();
  const { data: orgs } = useOrganizationStream();
  const { profile } = useAdviserProfile();

  // Reset pagination when tab changes
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setCurrentPage(1);
    setPageInput("1");
  };

  useEffect(() => {
    setCurrentPage(1);
    setPageInput("1");
  }, [searchQuery]);

  const filteredEvents = useMemo(() => {
    return events.filter(event => {
      const matchesSearch = event.title?.toLowerCase().includes(searchQuery.toLowerCase()) || false;
      if (!matchesSearch) return false;

      if (activeTab === "pending") return event.proposalStatus === "pending_review";
      if (activeTab === "approved") return event.proposalStatus === "approved";
      if (activeTab === "rejected") return event.proposalStatus === "rejected";
      return true; // all
    });
  }, [events, searchQuery, activeTab]);

  const totalPages = Math.max(1, Math.ceil(filteredEvents.length / ITEMS_PER_PAGE));
  
  const paginatedEvents = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredEvents.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredEvents, currentPage]);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
      setPageInput(newPage.toString());
    }
  };

  const handlePageInputSubmit = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const val = parseInt(pageInput);
      if (!isNaN(val) && val >= 1 && val <= totalPages) {
        setCurrentPage(val);
      } else {
        setPageInput(currentPage.toString());
      }
    }
  };

  // Badge counts
  const pendingCount = events.filter(e => e.proposalStatus === "pending_review").length;
  const approvedCount = events.filter(e => e.proposalStatus === "approved").length;
  const rejectedCount = events.filter(e => e.proposalStatus === "rejected").length;
  const allCount = events.length;

  const getOrgName = (orgId: string) => {
    return orgs.find(o => o.id === orgId)?.acronym || orgId;
  };

  const handleQuickApprove = async (event: EventDocument) => {
    if (!profile?.uid) return;
    setSubmittingId(event.id);
    try {
      await approveEvent(event.id, profile.uid, "Quick approved from dashboard.");
    } catch (error) {
      console.error(error);
    } finally {
      setSubmittingId(null);
    }
  };

  const handleQuickReject = async (event: EventDocument) => {
    if (!profile?.uid) return;
    setSubmittingId(event.id);
    try {
      await rejectEvent(event.id, profile.uid, "Rejected from dashboard", "Quick rejected from dashboard.");
    } catch (error) {
      console.error(error);
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#001A4D]">Event Approvals</h2>
          <p className="text-gray-500 text-sm">Review and approve event proposals from student organizations</p>
        </div>
        <div className="flex items-center gap-4">
          <Button
            onClick={() => setIsModalOpen(true)}
            className="bg-gradient-to-r from-[#001A4D] to-[#83358E] hover:from-[#001A4D]/90 hover:to-[#83358E]/90 text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create Event (SAO)
          </Button>
        </div>
      </div>

      {/* Status Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="bg-white border border-[#E0E0E0]">
          <TabsTrigger 
            value="pending"
            className="data-[state=active]:bg-[#001A4D] data-[state=active]:text-white data-[state=active]:border-b-[3px] data-[state=active]:border-[#FFC107] relative"
          >
            Pending
            <Badge className="ml-2 bg-[#FFC107] text-[#001A4D] hover:bg-[#FFC107]">{pendingCount}</Badge>
          </TabsTrigger>
          <TabsTrigger 
            value="approved"
            className="data-[state=active]:bg-[#001A4D] data-[state=active]:text-white data-[state=active]:border-b-[3px] data-[state=active]:border-[#FFC107]"
          >
            Approved
            <Badge className="ml-2 bg-[#FFC107] text-[#001A4D] hover:bg-[#FFC107]">{approvedCount}</Badge>
          </TabsTrigger>
          <TabsTrigger 
            value="rejected"
            className="data-[state=active]:bg-[#001A4D] data-[state=active]:text-white data-[state=active]:border-b-[3px] data-[state=active]:border-[#FFC107]"
          >
            Rejected
            <Badge className="ml-2 bg-[#FFC107] text-[#001A4D] hover:bg-[#FFC107]">{rejectedCount}</Badge>
          </TabsTrigger>
          <TabsTrigger 
            value="all"
            className="data-[state=active]:bg-[#001A4D] data-[state=active]:text-white data-[state=active]:border-b-[3px] data-[state=active]:border-[#FFC107]"
          >
            All Events
            <Badge className="ml-2 bg-[#FFC107] text-[#001A4D] hover:bg-[#FFC107]">{allCount}</Badge>
          </TabsTrigger>
        </TabsList>

        <div className="mt-6">
          <div className="space-y-4">
            {eventsLoading ? (
            <p className="text-gray-500 py-8 text-center">Loading events...</p>
          ) : paginatedEvents.length === 0 ? (
            <p className="text-gray-500 py-8 text-center">No events found matching the criteria.</p>
          ) : (
            paginatedEvents.map((event) => {
              const isPending = event.proposalStatus === 'pending_review';
              const isApproved = event.proposalStatus === 'approved';
              const isRejected = event.proposalStatus === 'rejected';
              
              const firstSession = event.sessions && event.sessions.length > 0 ? event.sessions[0].date : 'TBD';

              return (
                <Card key={event.id} className="border-[#E0E0E0] hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                      <div className={`w-2 h-2 rounded-full mt-2 ${isPending ? 'bg-[#FFC107]' : isApproved ? 'bg-green-500' : isRejected ? 'bg-red-500' : 'bg-gray-400'}`} />
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h3 className="font-bold text-[#001A4D] text-lg">{event.title}</h3>
                            <p className="text-gray-500 text-sm">{getOrgName(event.hostingOrgId)}</p>
                          </div>
                          <Badge className={`${isPending ? 'bg-[#FFC107] text-[#001A4D] hover:bg-[#FFC107]' : isApproved ? 'bg-gradient-to-r from-[#22C55E] to-[#16A34A] text-white border-0' : isRejected ? 'bg-gradient-to-r from-[#EF4444] to-[#F97316] text-white border-0' : 'bg-gray-100 text-gray-800'}`}>
                            {isPending ? 'Pending' : isApproved ? 'Approved' : isRejected ? 'Rejected' : event.proposalStatus}
                          </Badge>
                        </div>

                        {isRejected && event.rejectionReason && (
                          <div className="bg-red-50 border-l-2 border-red-500 p-4 mb-4 rounded">
                            <p className="text-sm text-gray-700">
                              <span className="font-medium">Rejection Reason:</span> {event.rejectionReason}
                            </p>
                          </div>
                        )}

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Calendar className={`w-4 h-4 ${isPending ? 'text-[#0E4EBD]' : isApproved ? 'text-green-600' : 'text-red-600'}`} />
                            <span>{firstSession}</span>
                          </div>
                          <div className="text-sm text-gray-600">
                            <span className="font-medium">Ref ID:</span> {event.referenceId}
                          </div>
                          <div className="text-sm text-gray-600">
                            <span className="font-medium">Format:</span> {event.eventFormat}
                          </div>
                          <div className="text-sm text-gray-600">
                            <span className="font-medium">Budget:</span> ₱{(event.totalApprovedBudget || 0).toLocaleString()}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {isPending && (
                            <>
                              <Button 
                                disabled={submittingId === event.id}
                                onClick={() => handleQuickApprove(event)}
                                className="bg-gradient-to-r from-[#22C55E] to-[#16A34A] hover:from-[#16A34A] hover:to-[#22C55E] text-white"
                              >
                                <CheckCircle2 className="w-4 h-4 mr-2" />
                                Approve
                              </Button>
                              <Button 
                                disabled={submittingId === event.id}
                                onClick={() => handleQuickReject(event)}
                                className="bg-gradient-to-r from-[#EF4444] to-[#F97316] hover:from-[#F97316] hover:to-[#EF4444] text-white"
                              >
                                <XCircle className="w-4 h-4 mr-2" />
                                Reject
                              </Button>
                            </>
                          )}
                          <Button variant="outline" className="border-[#0E4EBD] text-[#0E4EBD] hover:bg-[#E0E0E0]/50" onClick={() => setSelectedEvent(event)}>
                            <Eye className="w-4 h-4 mr-2" />
                            View Details
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
          </div>
        </div>

        {/* Pagination Controls */}
        <div className="flex items-center justify-between mt-6 bg-white p-4 rounded-xl border border-[#E0E0E0]">
          <p className="text-sm text-gray-500">
            {filteredEvents.length === 0 
              ? "No events found" 
              : `Showing ${(currentPage - 1) * ITEMS_PER_PAGE + 1} to ${Math.min(currentPage * ITEMS_PER_PAGE, filteredEvents.length)} of ${filteredEvents.length} events`}
          </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="flex items-center gap-2 px-2">
                <span className="text-sm text-gray-600">Page</span>
                <Input
                  className="w-12 h-8 text-center px-1"
                  value={pageInput}
                  onChange={(e) => setPageInput(e.target.value)}
                  onKeyDown={handlePageInputSubmit}
                  onBlur={() => setPageInput(currentPage.toString())}
                />
                <span className="text-sm text-gray-600">of {totalPages}</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
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
