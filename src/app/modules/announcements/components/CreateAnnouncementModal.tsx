import { useState, useMemo } from 'react';
import { X, Send, AlertCircle, Building2, Globe, Users } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { useSemesters } from '@/app/modules/academic';
import { useOrganizationStream } from '@/app/modules/organizations/hooks/useOrganizationStream';
import { useAdviserProfile } from '@/app/modules/auth/hooks/useAdviserProfile';
import { createAnnouncement } from '../services/announcement.service';
import type { AnnouncementPriority, AnnouncementAudience, CreateAnnouncementPayload } from '../types/announcement.types';

interface CreateAnnouncementModalProps {
  onClose: () => void;
}

export function CreateAnnouncementModal({ onClose }: CreateAnnouncementModalProps) {
  const { profile } = useAdviserProfile();
  const { data: semesters } = useSemesters();
  const activeSemester = useMemo(() => semesters.find(s => s.status === 'ACTIVE'), [semesters]);
  const { data: organizations = [], loading: orgsLoading } = useOrganizationStream();
  
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [priority, setPriority] = useState<AnnouncementPriority>('Normal');
  const [audience, setAudience] = useState<AnnouncementAudience>('campus-wide');
  const [targetOrgIds, setTargetOrgIds] = useState<string[]>([]);
  const [pinned, setPinned] = useState(false);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter only active organizations for selection
  const activeOrgs = useMemo(() => {
    return organizations.filter(org => org.status === 'active');
  }, [organizations]);

  const toggleTargetOrg = (orgId: string) => {
    setTargetOrgIds(prev => 
      prev.includes(orgId) ? prev.filter(id => id !== orgId) : [...prev, orgId]
    );
  };

  const handleSelectAllOrgs = () => {
    if (targetOrgIds.length === activeOrgs.length) {
      setTargetOrgIds([]);
    } else {
      setTargetOrgIds(activeOrgs.map(org => org.id));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    
    if (!content.trim()) {
      setError('Content is required');
      return;
    }
    
    if (audience === 'specific' && targetOrgIds.length === 0) {
      setError('Please select at least one organization');
      return;
    }

    if (!profile) {
      setError('You must be logged in to post an announcement');
      return;
    }

    if (!activeSemester) {
      setError('No active semester found');
      return;
    }

    try {
      setIsSubmitting(true);
      
      const targetOrgNames = audience === 'specific' 
        ? targetOrgIds.map(id => activeOrgs.find(o => o.id === id)?.name || 'Unknown Organization')
        : [];

      const payload: CreateAnnouncementPayload = {
        title: title.trim(),
        content: content.trim(),
        priority,
        audience,
        targetOrgIds: audience === 'specific' ? targetOrgIds : [],
        targetOrgNames,
        pinned,
        semesterId: activeSemester.id,
        schoolYear: activeSemester.academicYear,
      };

      await createAnnouncement(payload, profile.uid, profile.displayName);
      onClose();
    } catch (err) {
      console.error('Error creating announcement:', err);
      setError('Failed to post announcement. Please try again.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/55" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-[#001A4D] to-[#83358E] px-6 py-5 flex items-center justify-between flex-shrink-0">
          <div className="text-white">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Send className="w-5 h-5 text-[#FFC107]" />
              Post Announcement
            </h2>
            <p className="text-white/80 text-sm mt-1">Broadcast a message to students and organizations</p>
          </div>
          <button onClick={onClose} className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <form id="announcement-form" onSubmit={handleSubmit} className="space-y-6">
            
            {error && (
              <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            )}

            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Announcement Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
                placeholder="e.g., Reminder: Event Proposal Deadline"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent transition-shadow"
                required
              />
              <div className="text-right text-xs text-gray-500 mt-1">{title.length}/120</div>
            </div>

            {/* Priority */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Priority Level</label>
              <div className="grid grid-cols-3 gap-3">
                {(['Normal', 'Important', 'Urgent'] as AnnouncementPriority[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={`py-2 px-4 rounded-lg border text-sm font-medium transition-colors ${
                      priority === p 
                        ? p === 'Urgent' ? 'bg-red-50 border-red-200 text-red-700 ring-1 ring-red-500'
                        : p === 'Important' ? 'bg-amber-50 border-amber-200 text-amber-700 ring-1 ring-amber-500'
                        : 'bg-gray-100 border-gray-300 text-gray-900 ring-1 ring-gray-400'
                        : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Content Body */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Message Content <span className="text-red-500">*</span>
              </label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={6}
                placeholder="Write your announcement message here..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#83358E] focus:border-transparent transition-shadow resize-none"
                required
              />
            </div>

            {/* Audience Section */}
            <div className="border-t border-gray-200 pt-6">
              <div className="flex items-center gap-2 mb-4 border-l-4 border-[#83358E] pl-3">
                <h3 className="text-[#001A4D] font-bold text-base">Target Audience</h3>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                <button
                  type="button"
                  onClick={() => { setAudience('campus-wide'); setTargetOrgIds([]); }}
                  className={`flex items-center gap-2 py-2.5 px-4 rounded-lg border text-sm font-medium transition-colors ${
                    audience === 'campus-wide'
                      ? 'bg-blue-50 border-blue-200 text-[#0E4EBD] ring-1 ring-[#0E4EBD]'
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Globe className="w-4 h-4" /> Campus-Wide
                </button>
                <button
                  type="button"
                  onClick={() => { setAudience('all-organizations'); setTargetOrgIds([]); }}
                  className={`flex items-center gap-2 py-2.5 px-4 rounded-lg border text-sm font-medium transition-colors ${
                    audience === 'all-organizations'
                      ? 'bg-blue-50 border-blue-200 text-[#0E4EBD] ring-1 ring-[#0E4EBD]'
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Building2 className="w-4 h-4" /> All Organizations
                </button>
                <button
                  type="button"
                  onClick={() => setAudience('specific')}
                  className={`flex items-center gap-2 py-2.5 px-4 rounded-lg border text-sm font-medium transition-colors ${
                    audience === 'specific'
                      ? 'bg-blue-50 border-blue-200 text-[#0E4EBD] ring-1 ring-[#0E4EBD]'
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Users className="w-4 h-4" /> Specific Orgs
                </button>
              </div>

              {/* Specific Orgs Dropdown/Selector */}
              {audience === 'specific' && (
                <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-sm font-medium text-gray-900">Select Organizations</label>
                    <button 
                      type="button"
                      onClick={handleSelectAllOrgs}
                      className="text-xs font-medium text-[#0E4EBD] hover:underline"
                    >
                      {targetOrgIds.length === activeOrgs.length ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>
                  
                  {orgsLoading ? (
                    <div className="text-sm text-gray-500 py-2">Loading organizations...</div>
                  ) : activeOrgs.length === 0 ? (
                    <div className="text-sm text-gray-500 py-2">No active organizations found.</div>
                  ) : (
                    <div className="max-h-48 overflow-y-auto pr-2 space-y-1">
                      {activeOrgs.map(org => (
                        <label key={org.id} className="flex items-center gap-3 p-2 hover:bg-white rounded cursor-pointer border border-transparent hover:border-gray-200 transition-colors">
                          <input
                            type="checkbox"
                            checked={targetOrgIds.includes(org.id)}
                            onChange={() => toggleTargetOrg(org.id)}
                            className="w-4 h-4 text-[#0E4EBD] border-gray-300 rounded focus:ring-[#0E4EBD]"
                          />
                          <span className="text-sm text-gray-700 font-medium">{org.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Pin Toggle */}
            <div className="flex items-start gap-3 p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <label className="font-medium text-gray-900">Pin Announcement</label>
                </div>
                <p className="text-sm text-gray-600">Pinning will keep this announcement at the top of the feed.</p>
              </div>
              <button
                type="button"
                onClick={() => setPinned(!pinned)}
                className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${
                  pinned ? 'bg-[#83358E]' : 'bg-gray-300'
                }`}
              >
                <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow ${
                  pinned ? 'translate-x-6' : ''
                }`} />
              </button>
            </div>

          </form>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 border-t border-gray-200 px-6 py-4 flex justify-end gap-3 flex-shrink-0">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button 
            form="announcement-form" 
            type="submit" 
            disabled={isSubmitting}
            className="bg-[#001A4D] hover:bg-[#001A4D]/90 text-white"
          >
            {isSubmitting ? 'Posting...' : 'Post Announcement'}
          </Button>
        </div>

      </div>
    </div>
  );
}
