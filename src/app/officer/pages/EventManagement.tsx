import { useState } from 'react';
import { Calendar, MapPin, Users, Edit, Trash2, Plus, Search, X, Check } from 'lucide-react';
import OfficerEventProposalModal from '../components/OfficerEventProposalModal';

type EventStatus = 'all' | 'draft' | 'pending' | 'approved' | 'completed' | 'rejected';
type EventType = 'Academic' | 'Civic' | 'Cultural' | 'Sports' | 'General Assembly';

interface Event {
  id: number;
  name: string;
  type: EventType;
  date: string;
  startTime: string;
  endTime: string;
  venue: string;
  organization: string;
  expectedAttendance: number;
  status: 'draft' | 'pending' | 'approved' | 'completed' | 'rejected';
  description?: string;
}

export default function EventManagement() {
  const [activeStatus, setActiveStatus] = useState<EventStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEventDetail, setShowEventDetail] = useState<number | null>(null);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);

  const mockEvents: Event[] = [
    {
      id: 1,
      name: 'IT Guild General Assembly',
      type: 'General Assembly',
      date: 'Jun 15, 2026',
      startTime: '8:00 AM',
      endTime: '12:00 PM',
      venue: 'AVR Hall',
      organization: 'STI IT Guild',
      expectedAttendance: 120,
      status: 'approved',
      description: 'First semester general assembly for all IT Guild members',
    },
    {
      id: 2,
      name: 'Leadership Summit 2026',
      type: 'Academic',
      date: 'Jun 22, 2026',
      startTime: '9:00 AM',
      endTime: '5:00 PM',
      venue: 'Conference Room A',
      organization: 'STI IT Guild',
      expectedAttendance: 50,
      status: 'pending',
      description: 'Annual leadership development summit for student officers',
    },
    {
      id: 3,
      name: 'Team Building Activity',
      type: 'Cultural',
      date: 'Jul 5, 2026',
      startTime: '1:00 PM',
      endTime: '6:00 PM',
      venue: 'Beach Resort',
      organization: 'STI IT Guild',
      expectedAttendance: 80,
      status: 'draft',
      description: 'Summer team building activity for organization bonding',
    },
    {
      id: 4,
      name: 'Programming Workshop Series',
      type: 'Academic',
      date: 'Jul 12, 2026',
      startTime: '2:00 PM',
      endTime: '5:00 PM',
      venue: 'Computer Lab 1',
      organization: 'STI IT Guild',
      expectedAttendance: 40,
      status: 'draft',
      description: 'Three-day workshop on modern web development',
    },
    {
      id: 5,
      name: 'Community Outreach Program',
      type: 'Civic',
      date: 'Jun 30, 2026',
      startTime: '8:00 AM',
      endTime: '3:00 PM',
      venue: 'Barangay Hall',
      organization: 'STI IT Guild',
      expectedAttendance: 30,
      status: 'approved',
      description: 'Digital literacy program for local community',
    },
    {
      id: 6,
      name: 'Sports Fest Registration',
      type: 'Sports',
      date: 'Aug 1, 2026',
      startTime: '10:00 AM',
      endTime: '4:00 PM',
      venue: 'Sports Complex',
      organization: 'STI IT Guild',
      expectedAttendance: 100,
      status: 'rejected',
      description: 'Inter-organization sports competition',
    },
  ];

  const filteredEvents = mockEvents.filter((event) => {
    const matchesStatus = activeStatus === 'all' || event.status === activeStatus;
    const matchesSearch = event.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const statusColors = {
    draft: 'bg-[#888780]',
    pending: 'bg-[#BA7517]',
    approved: 'bg-[#639922]',
    completed: 'bg-[#0E4EBD]',
    rejected: 'bg-[#E24B4A]',
  };

  const eventTypeColors = {
    Academic: 'bg-[#0E9C9C]',
    Civic: 'bg-[#639922]',
    Cultural: 'bg-[#F97316]',
    Sports: 'bg-[#E24B4A]',
    'General Assembly': 'bg-[#7F77DD]',
  };

  const statusCounts = {
    all: mockEvents.length,
    draft: mockEvents.filter((e) => e.status === 'draft').length,
    pending: mockEvents.filter((e) => e.status === 'pending').length,
    approved: mockEvents.filter((e) => e.status === 'approved').length,
    completed: mockEvents.filter((e) => e.status === 'completed').length,
    rejected: mockEvents.filter((e) => e.status === 'rejected').length,
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[#888780] text-[13px] mb-1">Dashboard &gt; Event Management</div>
          <h1 className="text-[#001A4D] text-[24px] font-bold">Event Management</h1>
        </div>
        <button
          onClick={() => {
            setEditingEvent(null);
            setShowCreateModal(true);
          }}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#7F77DD] text-white rounded-lg text-[14px] font-medium hover:bg-[#7F77DD]/90"
        >
          <Plus className="w-5 h-5" />
          Create Event Proposal
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-[#E0E0E0] rounded-xl p-4">
        <div className="flex items-center gap-4 mb-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#888780]" />
            <input
              type="text"
              placeholder="Search events..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-[#E0E0E0] rounded-lg text-[14px] focus:border-[#7F77DD] focus:ring-2 focus:ring-[#7F77DD]/20 outline-none"
            />
          </div>
          <select className="px-4 py-2 border border-[#E0E0E0] rounded-lg text-[14px] text-[#001A4D] focus:border-[#7F77DD] focus:ring-2 focus:ring-[#7F77DD]/20 outline-none">
            <option>Sort by: Newest</option>
            <option>Sort by: Oldest</option>
            <option>Sort by: Upcoming</option>
          </select>
        </div>

        {/* Status Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto">
          {[
            { key: 'all', label: 'All' },
            { key: 'draft', label: 'Draft' },
            { key: 'pending', label: 'Pending Approval' },
            { key: 'approved', label: 'Approved' },
            { key: 'completed', label: 'Completed' },
            { key: 'rejected', label: 'Rejected' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveStatus(tab.key as EventStatus)}
              className={`px-4 py-2 rounded-lg text-[13px] font-medium whitespace-nowrap transition-colors ${
                activeStatus === tab.key
                  ? 'bg-[#7F77DD] text-white'
                  : 'bg-[#F8F8F8] text-[#888780] hover:bg-[#EEEDFE]'
              }`}
            >
              {tab.label} ({statusCounts[tab.key as EventStatus]})
            </button>
          ))}
        </div>
      </div>

      {/* Event Cards Grid */}
      {filteredEvents.length === 0 ? (
        <div className="bg-white border border-[#E0E0E0] rounded-xl p-12 text-center">
          <Calendar className="w-16 h-16 text-[#888780] mx-auto mb-4" />
          <p className="text-[#888780] text-[14px]">No events yet. Create your first event proposal.</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-6">
          {filteredEvents.map((event) => (
            <div key={event.id} className="bg-white border border-[#E0E0E0] rounded-xl overflow-hidden hover:shadow-lg transition-shadow">
              {/* Category Color Strip */}
              <div className={`h-2 ${eventTypeColors[event.type]}`} />

              <div className="p-5">
                {/* Event Name */}
                <h3 className="text-[#001A4D] text-[16px] font-bold mb-3">{event.name}</h3>

                {/* Date, Time, Venue */}
                <div className="space-y-2 mb-3">
                  <div className="flex items-center gap-2 text-[#888780] text-[13px]">
                    <Calendar className="w-4 h-4" />
                    <span>
                      {event.date} · {event.startTime} - {event.endTime}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[#888780] text-[13px]">
                    <MapPin className="w-4 h-4" />
                    <span>{event.venue}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[#888780] text-[13px]">
                    <Users className="w-4 h-4" />
                    <span>{event.expectedAttendance} expected attendees</span>
                  </div>
                </div>

                {/* Organization Badge */}
                <div className="mb-3">
                  <span className="inline-block px-2 py-1 bg-[#EEEDFE] text-[#7F77DD] rounded text-[11px] font-medium">
                    {event.organization}
                  </span>
                </div>

                {/* Status Pill */}
                <div className="mb-4">
                  <span className={`inline-block px-3 py-1 ${statusColors[event.status]} text-white rounded text-[12px] font-medium capitalize`}>
                    {event.status}
                  </span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3 pt-3 border-t border-[#E0E0E0]">
                  <button
                    onClick={() => setShowEventDetail(event.id)}
                    className="text-[#7F77DD] text-[13px] font-medium hover:underline"
                  >
                    View Details
                  </button>
                  <button
                    onClick={() => {
                      setEditingEvent(event);
                      setShowCreateModal(true);
                    }}
                    disabled={event.status === 'approved'}
                    className={`p-1.5 rounded hover:bg-[#F8F8F8] ${
                      event.status === 'approved' ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    <Edit className="w-4 h-4 text-[#888780]" />
                  </button>
                  <button
                    disabled={event.status === 'approved'}
                    className={`p-1.5 rounded hover:bg-[#F8F8F8] ${
                      event.status === 'approved' ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    <Trash2 className="w-4 h-4 text-[#E24B4A]" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Event Modal */}
      <OfficerEventProposalModal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} />

      {/* Event Detail Modal */}
      {showEventDetail && (
        <EventDetailModal
          event={mockEvents.find((e) => e.id === showEventDetail)!}
          onClose={() => setShowEventDetail(null)}
        />
      )}
    </div>
  );
}


function EventDetailModal({ event, onClose }: { event: Event; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6">
      <div className="bg-white rounded-xl w-full max-w-5xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-[#E0E0E0] px-6 py-4 flex items-center justify-between">
          <h2 className="text-[#001A4D] text-[20px] font-bold">Event Details</h2>
          <button onClick={onClose} className="p-2 hover:bg-[#F8F8F8] rounded-lg">
            <X className="w-5 h-5 text-[#888780]" />
          </button>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-12 gap-6">
            <div className="col-span-8 space-y-6">
              <div className="bg-white border border-[#E0E0E0] rounded-xl p-5">
                <h3 className="text-[#001A4D] text-[16px] font-bold mb-4">Event Information</h3>
                <div className="space-y-3">
                  <div>
                    <span className="text-[#888780] text-[12px] font-medium">Event Name</span>
                    <p className="text-[#001A4D] text-[14px] font-bold mt-1">{event.name}</p>
                  </div>
                  <div>
                    <span className="text-[#888780] text-[12px] font-medium">Event Type</span>
                    <p className="text-[#001A4D] text-[14px] mt-1">{event.type}</p>
                  </div>
                  <div>
                    <span className="text-[#888780] text-[12px] font-medium">Description</span>
                    <p className="text-[#001A4D] text-[14px] mt-1">{event.description}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="col-span-4">
              <div className="bg-white border border-[#E0E0E0] rounded-xl p-5">
                <h3 className="text-[#001A4D] text-[16px] font-bold mb-4">Approval Timeline</h3>
                <div className="space-y-4">
                  <div className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="w-8 h-8 rounded-full bg-[#639922] flex items-center justify-center">
                        <Check className="w-4 h-4 text-white" />
                      </div>
                      <div className="w-0.5 h-full bg-[#E0E0E0] mt-2" />
                    </div>
                    <div className="flex-1 pb-4">
                      <p className="text-[#001A4D] text-[13px] font-bold">Submitted</p>
                      <p className="text-[#888780] text-[11px] mt-1">Jun 8, 2026 · 2:30 PM</p>
                    </div>
                  </div>

                  {event.status === 'approved' && (
                    <div className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className="w-8 h-8 rounded-full bg-[#639922] flex items-center justify-center">
                          <Check className="w-4 h-4 text-white" />
                        </div>
                      </div>
                      <div className="flex-1">
                        <p className="text-[#001A4D] text-[13px] font-bold">Approved</p>
                        <p className="text-[#639922] text-[12px] mt-2">Event proposal approved by SAO Adviser</p>
                      </div>
                    </div>
                  )}

                  {event.status === 'rejected' && (
                    <div className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className="w-8 h-8 rounded-full bg-[#E24B4A] flex items-center justify-center">
                          <X className="w-4 h-4 text-white" />
                        </div>
                      </div>
                      <div className="flex-1">
                        <p className="text-[#001A4D] text-[13px] font-bold">Rejected</p>
                        <div className="mt-3 p-3 bg-[#FEE2E2] border border-[#E24B4A] rounded-lg">
                          <p className="text-[#E24B4A] text-[11px] font-bold mb-1">Reason:</p>
                          <p className="text-[#001A4D] text-[12px]">
                            Venue conflicts with another event. Select different date or venue.
                          </p>
                        </div>
                        <button className="mt-3 w-full px-4 py-2 bg-[#7F77DD] text-white rounded-lg text-[13px] font-medium hover:bg-[#7F77DD]/90">
                          Revise and Resubmit
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
