import { useState } from 'react';
import { Megaphone, Pin, Plus, Users, Building2, Globe, Pencil, Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import { formatAppDateTime } from '../../../utils/date';
import { Card, CardContent } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Badge } from '@/app/components/ui/badge';
import { toast } from 'sonner';
import { useAnnouncementStream } from '../hooks/useAnnouncementStream';
import { togglePin, deleteAnnouncement } from '../services/announcement.service';
import { CreateAnnouncementModal } from './CreateAnnouncementModal';
import type { AnnouncementDocument } from '../types/announcement.types';

export function AnnouncementsDashboard() {
  const { announcements, loading } = useAnnouncementStream();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<AnnouncementDocument | null>(null);
  const [deletingAnnouncement, setDeletingAnnouncement] = useState<AnnouncementDocument | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleTogglePin = async (id: string, currentPinned: boolean) => {
    try {
      await togglePin(id, !currentPinned);
      toast.success(currentPinned ? 'Announcement unpinned.' : 'Announcement pinned to top.');
    } catch (err: any) {
      console.error('Failed to toggle pin:', err);
      toast.error('Failed to update pin status.');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingAnnouncement) return;
    try {
      setIsDeleting(true);
      await deleteAnnouncement(deletingAnnouncement.id);
      toast.success('Announcement deleted successfully.');
      setDeletingAnnouncement(null);
    } catch (err: any) {
      console.error('Failed to delete announcement:', err);
      toast.error(err.message || 'Failed to delete announcement.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header - No duplicate title since TopNav already displays "Announcements" */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-gray-500 text-sm font-medium">
            Publish official announcements, emergency advisories, and targeted messages to student bodies
          </p>
        </div>
        <Button 
          onClick={() => {
            setEditingAnnouncement(null);
            setIsCreateModalOpen(true);
          }}
          className="bg-gradient-to-r from-[#001A4D] to-[#83358E] hover:from-[#001A4D]/90 hover:to-[#83358E]/90 text-white cursor-pointer shadow-xs"
        >
          <Plus className="w-4 h-4 mr-2" />
          Post Announcement
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#001A4D]" />
        </div>
      ) : (
        <>
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
                    {/* Avatar Badge */}
                    <div className="w-12 h-12 bg-[#001A4D] rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 ring-2 ring-[#FFC107]">
                      SAS
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
                            <span className="font-medium">{announcement.authorName}</span>
                            <span>•</span>
                            <span>
                              {formatAppDateTime(announcement.createdAt, 'Just now', ' at ')}
                            </span>
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
                            <Badge variant="outline" className="text-gray-600">
                              Normal
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Content */}
                      <p className="text-gray-700 whitespace-pre-wrap mb-4 text-sm leading-relaxed">
                        {announcement.content}
                      </p>

                      {/* Footer Info */}
                      <div className="flex items-center justify-between pt-4 border-t border-[#E0E0E0] text-sm text-gray-500">
                        {/* Target Audience */}
                        <div className="flex items-center gap-2">
                          {announcement.audience === "campus-wide" && (
                            <span className="flex items-center gap-1.5 text-blue-700 font-medium">
                              <Globe className="w-4 h-4" />
                              Campus-Wide
                            </span>
                          )}
                          {announcement.audience === "all-organizations" && (
                            <span className="flex items-center gap-1.5 text-indigo-700 font-medium">
                              <Building2 className="w-4 h-4" />
                              All Organizations
                            </span>
                          )}
                          {announcement.audience === "specific" && (
                            <span className="flex items-center gap-1.5 text-purple-700 font-medium">
                              <Users className="w-4 h-4" />
                              {announcement.targetOrgNames && announcement.targetOrgNames.length > 0
                                ? announcement.targetOrgNames.join(", ")
                                : `${announcement.targetOrgIds?.length || 0} Organizations`}
                            </span>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2">
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            onClick={() => handleTogglePin(announcement.id, announcement.pinned)}
                            className="text-[#BA7517] hover:text-[#94580D] hover:bg-amber-50 cursor-pointer font-medium"
                          >
                            <Pin className="w-4 h-4 mr-1" />
                            {announcement.pinned ? 'Unpin' : 'Pin'}
                          </Button>
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            onClick={() => setEditingAnnouncement(announcement)}
                            className="text-[#0E4EBD] hover:text-[#0A3D96] hover:bg-blue-50 cursor-pointer font-medium"
                          >
                            <Pencil className="w-3.5 h-3.5 mr-1" />
                            Edit
                          </Button>
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            onClick={() => setDeletingAnnouncement(announcement)}
                            className="text-red-500 hover:text-red-600 hover:bg-red-50 cursor-pointer font-medium"
                          >
                            <Trash2 className="w-3.5 h-3.5 mr-1" />
                            Delete
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Empty State */}
          {announcements.length === 0 && (
            <Card className="border-[#E0E0E0]">
              <CardContent className="p-12 text-center">
                <Megaphone className="w-16 h-16 text-[#0E4EBD] mx-auto mb-4 opacity-50" />
                <h3 className="text-xl font-bold text-[#001A4D] mb-2">No Announcements Yet</h3>
                <p className="text-gray-500 mb-4">Create your first announcement to notify students and organizations.</p>
                <Button 
                  onClick={() => {
                    setEditingAnnouncement(null);
                    setIsCreateModalOpen(true);
                  }}
                  className="bg-[#001A4D] hover:bg-[#0E4EBD] text-white cursor-pointer"
                >
                  <Plus className="w-4 h-4 mr-2 text-[#FFC107]" />
                  Post Announcement
                </Button>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Create / Edit Modal */}
      {(isCreateModalOpen || editingAnnouncement) && (
        <CreateAnnouncementModal 
          announcement={editingAnnouncement}
          onClose={() => {
            setIsCreateModalOpen(false);
            setEditingAnnouncement(null);
          }} 
        />
      )}

      {/* Styled Delete Confirmation Dialog */}
      {deletingAnnouncement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-xs transition-opacity" 
            onClick={() => !isDeleting && setDeletingAnnouncement(null)} 
          />
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 z-10 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3.5 text-red-600 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#001A4D]">Delete Announcement</h3>
                <p className="text-xs text-gray-500">This action cannot be reversed</p>
              </div>
            </div>

            <p className="text-sm text-gray-600 mb-2 leading-relaxed">
              Are you sure you want to permanently delete:
            </p>
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl mb-5">
              <p className="text-sm font-bold text-[#001A4D] line-clamp-2">
                "{deletingAnnouncement.title}"
              </p>
            </div>

            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                disabled={isDeleting}
                onClick={() => setDeletingAnnouncement(null)}
                className="cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="bg-red-600 hover:bg-red-700 text-white cursor-pointer font-semibold"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4 mr-1.5" />
                    Delete Announcement
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
