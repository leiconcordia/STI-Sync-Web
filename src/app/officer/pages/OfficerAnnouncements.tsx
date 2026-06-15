import { useState } from 'react';
import { Plus, X, Eye, Edit, Trash2, Pin, Bold, Italic, List, Link as LinkIcon } from 'lucide-react';

interface Announcement {
  id: number;
  organizationName: string;
  authorName: string;
  authorRole: string;
  timestamp: string;
  title: string;
  body: string;
  linkedEvent?: string;
  viewCount: number;
  isPinned: boolean;
}

export default function OfficerAnnouncements() {
  const [showCreateModal, setShowCreateModal] = useState(false);

  const mockAnnouncements: Announcement[] = [
    {
      id: 1,
      organizationName: 'STI IT Guild',
      authorName: 'Juan Dela Cruz',
      authorRole: 'President',
      timestamp: '2 hours ago',
      title: 'General Assembly Reminder',
      body: 'This is a friendly reminder that our General Assembly is scheduled for tomorrow, June 15, 2026, at 8:00 AM in the AVR Hall. All members are expected to attend. Please arrive on time as we have important announcements to make.',
      linkedEvent: 'IT Guild General Assembly',
      viewCount: 142,
      isPinned: true,
    },
    {
      id: 2,
      organizationName: 'STI IT Guild',
      authorName: 'Maria Santos',
      authorRole: 'Vice President',
      timestamp: '1 day ago',
      title: 'Leadership Summit Registration Now Open',
      body: 'We are excited to announce that registration for the Leadership Summit 2026 is now open! This is a great opportunity to develop your leadership skills and network with other student leaders. Limited slots available, so register early.',
      linkedEvent: 'Leadership Summit 2026',
      viewCount: 98,
      isPinned: false,
    },
    {
      id: 3,
      organizationName: 'STI IT Guild',
      authorName: 'Juan Dela Cruz',
      authorRole: 'President',
      timestamp: '3 days ago',
      title: 'Membership Dues Payment Deadline',
      body: 'Reminder to all members: The deadline for paying your membership dues is on June 20, 2026. Payment can be made through the Treasurer during office hours (2:00 PM - 4:00 PM, Room 301). Thank you for your cooperation!',
      viewCount: 215,
      isPinned: false,
    },
    {
      id: 4,
      organizationName: 'STI IT Guild',
      authorName: 'Pedro Garcia',
      authorRole: 'Secretary',
      timestamp: '5 days ago',
      title: 'Team Building Activity Save the Date',
      body: 'Save the date! Our annual Team Building Activity is scheduled for July 5, 2026, at the Beach Resort. More details to follow soon. This is a great opportunity to bond with your fellow members and have fun!',
      linkedEvent: 'Team Building Activity',
      viewCount: 187,
      isPinned: false,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[#888780] text-[13px] mb-1">Dashboard &gt; Announcements</div>
          <h1 className="text-[#001A4D] text-[24px] font-bold">Announcements</h1>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#7F77DD] text-white rounded-lg text-[14px] font-medium hover:bg-[#7F77DD]/90"
        >
          <Plus className="w-5 h-5" />
          Post Announcement
        </button>
      </div>

      <div className="space-y-4">
        {mockAnnouncements.map((announcement) => (
          <div
            key={announcement.id}
            className="bg-white border border-[#E0E0E0] rounded-xl p-6 hover:shadow-lg transition-shadow"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 bg-[#7F77DD] rounded-full flex items-center justify-center text-white font-bold text-sm">
                  IT
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-[#001A4D] text-[14px] font-bold">{announcement.authorName}</h3>
                    <span className="text-[#888780] text-[12px]">·</span>
                    <span className="text-[#888780] text-[12px]">{announcement.authorRole}</span>
                  </div>
                  <p className="text-[#888780] text-[12px]">{announcement.timestamp}</p>
                  {announcement.isPinned && (
                    <span className="inline-block mt-1 px-2 py-0.5 bg-[#BA7517] text-white rounded text-[10px] font-medium">
                      Pinned
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button className="p-2 hover:bg-[#F8F8F8] rounded-lg">
                  <Pin className="w-4 h-4 text-[#888780]" />
                </button>
                <button className="p-2 hover:bg-[#F8F8F8] rounded-lg">
                  <Edit className="w-4 h-4 text-[#888780]" />
                </button>
                <button className="p-2 hover:bg-[#FEE2E2] rounded-lg">
                  <Trash2 className="w-4 h-4 text-[#E24B4A]" />
                </button>
              </div>
            </div>

            <h2 className="text-[#001A4D] text-[18px] font-bold mb-2">{announcement.title}</h2>
            <p className="text-[#001A4D] text-[14px] leading-relaxed mb-3">
              {announcement.body.length > 200
                ? `${announcement.body.substring(0, 200)}... `
                : announcement.body}
              {announcement.body.length > 200 && (
                <button className="text-[#7F77DD] text-[14px] font-medium hover:underline">Read more</button>
              )}
            </p>

            {announcement.linkedEvent && (
              <div className="mb-3">
                <span className="inline-block px-3 py-1 bg-[#EEEDFE] text-[#7F77DD] rounded-full text-[12px] font-medium">
                  🎯 {announcement.linkedEvent}
                </span>
              </div>
            )}

            <div className="flex items-center gap-4 pt-3 border-t border-[#E0E0E0]">
              <div className="flex items-center gap-1 text-[#888780] text-[13px]">
                <Eye className="w-4 h-4" />
                <span>{announcement.viewCount} views</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showCreateModal && <CreateAnnouncementModal onClose={() => setShowCreateModal(false)} />}
    </div>
  );
}

function CreateAnnouncementModal({ onClose }: { onClose: () => void }) {
  const [formData, setFormData] = useState({
    title: '',
    body: '',
    linkedEvent: '',
    targetAudience: 'all',
    notificationType: 'in-app',
  });

  const handleSubmit = () => {
    console.log('Posting announcement:', formData);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6">
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-[#E0E0E0] px-6 py-4 flex items-center justify-between">
          <h2 className="text-[#001A4D] text-[20px] font-bold">Post Announcement</h2>
          <button onClick={onClose} className="p-2 hover:bg-[#F8F8F8] rounded-lg">
            <X className="w-5 h-5 text-[#888780]" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div>
            <label className="block text-[#001A4D] text-[13px] font-medium mb-2">Title</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-4 py-2 border border-[#E0E0E0] rounded-lg text-[14px] focus:border-[#7F77DD] focus:ring-2 focus:ring-[#7F77DD]/20 outline-none"
              placeholder="Enter announcement title"
            />
          </div>

          <div>
            <label className="block text-[#001A4D] text-[13px] font-medium mb-2">Body</label>

            <div className="border border-[#E0E0E0] rounded-t-lg px-3 py-2 bg-[#F8F8F8] flex items-center gap-2">
              <button className="p-2 hover:bg-white rounded">
                <Bold className="w-4 h-4 text-[#888780]" />
              </button>
              <button className="p-2 hover:bg-white rounded">
                <Italic className="w-4 h-4 text-[#888780]" />
              </button>
              <div className="w-px h-6 bg-[#E0E0E0]" />
              <button className="p-2 hover:bg-white rounded">
                <List className="w-4 h-4 text-[#888780]" />
              </button>
              <button className="p-2 hover:bg-white rounded">
                <LinkIcon className="w-4 h-4 text-[#888780]" />
              </button>
            </div>

            <textarea
              value={formData.body}
              onChange={(e) => setFormData({ ...formData, body: e.target.value })}
              rows={6}
              className="w-full px-4 py-3 border border-t-0 border-[#E0E0E0] rounded-b-lg text-[14px] focus:border-[#7F77DD] focus:ring-2 focus:ring-[#7F77DD]/20 outline-none resize-none"
              placeholder="Write your announcement here..."
            />
          </div>

          <div>
            <label className="block text-[#001A4D] text-[13px] font-medium mb-2">Link to Event (Optional)</label>
            <select
              value={formData.linkedEvent}
              onChange={(e) => setFormData({ ...formData, linkedEvent: e.target.value })}
              className="w-full px-4 py-2 border border-[#E0E0E0] rounded-lg text-[14px] focus:border-[#7F77DD] focus:ring-2 focus:ring-[#7F77DD]/20 outline-none"
            >
              <option value="">None</option>
              <option>IT Guild General Assembly</option>
              <option>Leadership Summit 2026</option>
              <option>Team Building Activity</option>
              <option>Programming Workshop</option>
            </select>
          </div>

          <div>
            <label className="block text-[#001A4D] text-[13px] font-medium mb-2">Target Audience</label>
            <div className="space-y-3">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="targetAudience"
                  value="all"
                  checked={formData.targetAudience === 'all'}
                  onChange={(e) => setFormData({ ...formData, targetAudience: e.target.value })}
                  className="w-4 h-4 text-[#7F77DD] border-[#E0E0E0]"
                />
                <span className="text-[#001A4D] text-[14px]">All Members</span>
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="targetAudience"
                  value="department"
                  checked={formData.targetAudience === 'department'}
                  onChange={(e) => setFormData({ ...formData, targetAudience: e.target.value })}
                  className="w-4 h-4 text-[#7F77DD] border-[#E0E0E0]"
                />
                <span className="text-[#001A4D] text-[14px]">Specific Department</span>
              </label>

              {formData.targetAudience === 'department' && (
                <div className="ml-6 grid grid-cols-2 gap-2">
                  {['BSIT', 'BSCS', 'BSA', 'All Departments'].map((dept) => (
                    <label key={dept} className="flex items-center gap-2">
                      <input type="checkbox" className="w-4 h-4 text-[#7F77DD] border-[#E0E0E0] rounded" />
                      <span className="text-[#001A4D] text-[13px]">{dept}</span>
                    </label>
                  ))}
                </div>
              )}

              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="targetAudience"
                  value="year"
                  checked={formData.targetAudience === 'year'}
                  onChange={(e) => setFormData({ ...formData, targetAudience: e.target.value })}
                  className="w-4 h-4 text-[#7F77DD] border-[#E0E0E0]"
                />
                <span className="text-[#001A4D] text-[14px]">Specific Year Level</span>
              </label>

              {formData.targetAudience === 'year' && (
                <div className="ml-6 grid grid-cols-2 gap-2">
                  {['1st Year', '2nd Year', '3rd Year', '4th Year'].map((year) => (
                    <label key={year} className="flex items-center gap-2">
                      <input type="checkbox" className="w-4 h-4 text-[#7F77DD] border-[#E0E0E0] rounded" />
                      <span className="text-[#001A4D] text-[13px]">{year}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-[#001A4D] text-[13px] font-medium mb-2">Notification Type</label>
            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="notificationType"
                  value="in-app"
                  checked={formData.notificationType === 'in-app'}
                  onChange={(e) => setFormData({ ...formData, notificationType: e.target.value })}
                  className="w-4 h-4 text-[#7F77DD] border-[#E0E0E0]"
                />
                <span className="text-[#001A4D] text-[14px]">In-App Only</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="notificationType"
                  value="push"
                  checked={formData.notificationType === 'push'}
                  onChange={(e) => setFormData({ ...formData, notificationType: e.target.value })}
                  className="w-4 h-4 text-[#7F77DD] border-[#E0E0E0]"
                />
                <span className="text-[#001A4D] text-[14px]">Push Notification</span>
              </label>
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 bg-white border-t border-[#E0E0E0] px-6 py-4 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2.5 border border-[#E0E0E0] text-[#001A4D] rounded-lg text-[14px] font-medium hover:bg-[#F8F8F8]"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="px-5 py-2.5 bg-[#7F77DD] text-white rounded-lg text-[14px] font-medium hover:bg-[#7F77DD]/90"
          >
            Post Announcement
          </button>
        </div>
      </div>
    </div>
  );
}
