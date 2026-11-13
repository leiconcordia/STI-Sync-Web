/**
 * src/app/modules/events/components/PublishStudentFeedModal.tsx
 *
 * Dedicated Modal for Activity Publishing & Student Feed Controls:
 * - Promotional banner upload (16:9 high resolution)
 * - Mobile student app visibility toggle & scheduled publish datetime
 * - Target academic tracks, programs, and year levels
 */

import React, { useState, useEffect } from 'react';
import {
  X,
  Smartphone,
  Upload,
  Check,
  Save,
  Lock,
} from 'lucide-react';
import { doc, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import { ACTIVITIES_COLLECTION } from '../services/event.service';
import type { EventDocument } from '../types/event.types';
import { uploadToCloudinary } from '../../../../services/cloudinary';
import { toast } from 'sonner';
import OperationalAudienceSelector, {
  buildOperationalAudiencePayload,
  isSpecificFilterValid,
  type OperationalAcademicLevel,
  type OperationalAudienceScope,
} from './OperationalAudienceSelector';

interface PublishStudentFeedModalProps {
  isOpen: boolean;
  onClose: () => void;
  activity: EventDocument;
  onUpdated?: () => void;
  readOnly?: boolean;
}

export default function PublishStudentFeedModal({
  isOpen,
  onClose,
  activity,
  onUpdated,
  readOnly = false,
}: PublishStudentFeedModalProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);

  // Operational publishing target state (never inherits Form AP-01 targetMarket/targetAudience)
  const [bannerUrl, setBannerUrl] = useState<string>(activity.bannerImageUrl || '');
  const [targetAudienceScope, setTargetAudienceScope] = useState<OperationalAudienceScope>('all');
  const [targetAcademicLevel, setTargetAcademicLevel] = useState<OperationalAcademicLevel>('BOTH');
  const [targetCourses, setTargetCourses] = useState<string[]>([]);
  const [targetYearLevels, setTargetYearLevels] = useState<string[]>([]);
  const [targetSections, setTargetSections] = useState<string[]>([]);

  // Load existing operational publish/attendance filters if configured, otherwise default to All Campus Students
  useEffect(() => {
    if (!activity) return;
    setBannerUrl(activity.bannerImageUrl || '');

    const hasOperationalTarget = Boolean(
      (activity as any).publishAudienceConfigured ||
      (activity as any).attendanceAudienceConfigured
    );

    if (!hasOperationalTarget) {
      setTargetAudienceScope('all');
      setTargetAcademicLevel('BOTH');
      setTargetCourses([]);
      setTargetYearLevels([]);
      setTargetSections([]);
      return;
    }

    const rawScope = (activity as any).targetAudienceScope;
    const rawLevel = ((activity as any).targetAcademicLevel as OperationalAcademicLevel) || 'BOTH';
    const rawCourses: string[] = Array.isArray((activity as any).targetCourses) ? (activity as any).targetCourses : [];
    const rawYears: string[] = Array.isArray((activity as any).targetYearLevels) ? (activity as any).targetYearLevels.map(String) : [];
    const rawSections: string[] = Array.isArray((activity as any).targetSections) ? (activity as any).targetSections : [];

    setTargetAcademicLevel(rawLevel);
    setTargetCourses(rawCourses);
    setTargetYearLevels(rawYears);
    setTargetSections(rawSections);

    if (rawScope === 'members') {
      setTargetAudienceScope('members');
    } else if (
      rawScope === 'specific' ||
      rawLevel !== 'BOTH' ||
      rawCourses.length > 0 ||
      rawYears.length > 0 ||
      rawSections.length > 0
    ) {
      setTargetAudienceScope('specific');
    } else {
      setTargetAudienceScope('all');
    }
  }, [activity]);

  if (!isOpen) return null;

  // Banner Upload
  const handleBannerFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingBanner(true);
    try {
      const result = await uploadToCloudinary(file, { folder: 'activities/banners' });
      setBannerUrl(result.secureUrl);
      toast.success('Activity promotional banner uploaded successfully!');
    } catch (err: any) {
      console.error('Banner upload error:', err);
      toast.error('Failed to upload banner: ' + (err?.message || 'Please try again'));
    } finally {
      setIsUploadingBanner(false);
    }
  };

  // Save Settings (Automatically publishes approved activity on save)
  const handleSave = async () => {
    if (!isSpecificFilterValid(targetAudienceScope, targetAcademicLevel, targetCourses, targetYearLevels, targetSections)) {
      toast.error('Please select at least one Division, Year Level, Program/Strand, or Section—or choose "All Campus Students".');
      return;
    }

    setIsSaving(true);
    try {
      const audiencePayload = buildOperationalAudiencePayload({
        audienceScope: targetAudienceScope,
        academicLevel: targetAcademicLevel,
        targetCourses,
        targetYearLevels,
        targetSections,
      });

      const payload = {
        bannerImageUrl: bannerUrl || null,
        visibleToStudents: true,
        isVisible: true,
        isPublished: true,
        lifecycleStatus: 'published',
        visibilityStart: null,
        publishAudienceConfigured: true,
        ...audiencePayload,
        updatedAt: serverTimestamp(),
      };

      const docRef = doc(db, ACTIVITIES_COLLECTION, activity.id);
      await updateDoc(docRef, payload);

      // Dual-sync complete activity metadata to events collection for mobile app
      // Do NOT treat AP's proposed schedule as operational attendance sessions unless configured in Attendance & Scanners
      const hasConfiguredAttendance = Boolean((activity as any).attendanceSessionsConfigured);
      try {
        const eventDocRef = doc(db, 'events', activity.id);
        const eventPayload: Record<string, any> = {
          ...payload,
          id: activity.id,
          referenceId: activity.referenceId || (activity as any).referenceNo || '',
          title: activity.title || '',
          description: activity.description || '',
          date: activity.date || (activity as any).startDate || '',
          startDate: (activity as any).startDate || activity.date || '',
          startTime: (activity as any).startTime || '08:00',
          endTime: (activity as any).endTime || '12:00',
          venueName: (activity as any).venueName || (activity as any).customVenueName || 'STI Campus',
          customVenueName: (activity as any).customVenueName || (activity as any).venueName || 'STI Campus',
          venueId: (activity as any).venueId || 'campus_venue',
          eventFormat: (activity as any).eventFormat || 'On-Campus',
          hostingOrgId: (activity as any).hostingOrgId || (activity as any).organizationId || '',
          attendanceSessionsConfigured: hasConfiguredAttendance,
          sessions: hasConfiguredAttendance ? (activity.sessions || []) : [],
          scanners: (activity as any).scanners || [],
          scannerUserIds: (activity as any).scannerUserIds || [],
          status: activity.status || 'approved',
          proposalStatus: activity.proposalStatus || 'approved',
          isActivityProposal: true,
        };
        await setDoc(eventDocRef, eventPayload, { merge: true });
      } catch (evtErr) {
        console.warn('[PublishStudentFeedModal] Failed to mirror to events collection:', evtErr);
      }

      toast.success('Activity published & feed settings updated successfully!');
      if (onUpdated) onUpdated();
      onClose();
    } catch (err: any) {
      console.error('Failed to save feed settings:', err);
      toast.error(err?.message || 'Failed to save settings.');
    } finally {
      setIsSaving(false);
    }
  };


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/75 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-[#001A4D] text-white px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#0E4EBD] text-white flex items-center justify-center shadow-md">
              <Smartphone className="w-5 h-5 text-[#FFD41C]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">Publish & Student App Settings</h2>
                <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-[#FFD41C] border border-blue-400/30">
                  {activity.referenceId}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5 truncate max-w-md">
                {activity.title}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 p-6 overflow-y-auto space-y-6 bg-slate-50/50">
          {/* Read-Only Notice for Club-Managed Event */}
          {readOnly && (
            <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 flex items-center gap-3 text-xs text-amber-950 shadow-xs">
              <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center flex-shrink-0">
                <Lock className="w-4 h-4" />
              </div>
              <div>
                <p className="font-bold text-amber-950">Organization-Managed Utility • Read-Only for Administrators</p>
                <p className="text-amber-800 text-[11px] mt-0.5">
                  Mobile publishing and audience scope for student organization activities are configured exclusively by designated club officers.
                </p>
              </div>
            </div>
          )}

          {/* Section 1: Automatic Mobile App Feed Publication */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0">
                  <Check className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-emerald-950">Auto-Published to Mobile Student Feed</h4>
                  <p className="text-[11px] text-emerald-800 mt-0.5">
                    Clicking "Save & Publish Activity" automatically publishes this approved activity to eligible students on the mobile app.
                  </p>
                </div>
              </div>
              <span className="px-2.5 py-1 text-[10px] font-bold uppercase rounded-full bg-emerald-600 text-white tracking-wider flex-shrink-0">
                Auto-Publish
              </span>
            </div>
          </div>

          {/* Section 2: Promotional Banner Upload */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Promotional Banner Image
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  16:9 banner displayed on the mobile app header and web activities dashboard.
                </p>
              </div>
            </div>

            {bannerUrl ? (
              <div className="space-y-3">
                <div className="relative rounded-2xl overflow-hidden border border-slate-200 shadow-sm aspect-video bg-slate-950 flex items-center justify-center max-h-56">
                  <img
                    src={bannerUrl}
                    alt="Activity Banner"
                    className="w-full h-full object-cover"
                  />
                </div>
                {!readOnly && (
                  <div className="flex justify-center gap-2">
                    <label className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl cursor-pointer shadow-xs inline-flex items-center gap-1.5">
                      <Upload className="w-3.5 h-3.5 text-blue-600" />
                      <span>{isUploadingBanner ? 'Uploading...' : 'Replace Banner Image'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleBannerFileChange}
                        disabled={isUploadingBanner}
                        className="hidden"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => setBannerUrl('')}
                      className="px-3 py-2 text-rose-600 hover:bg-rose-50 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                    >
                      Remove Banner
                    </button>
                  </div>
                )}
              </div>
            ) : readOnly ? (
              <div className="border border-slate-200 bg-slate-50/50 rounded-2xl p-6 text-center text-xs text-slate-400 italic">
                No promotional banner image uploaded by student organization officers.
              </div>
            ) : (
              <label className="border-2 border-dashed border-slate-300 hover:border-blue-400 bg-slate-50 hover:bg-blue-50/20 rounded-2xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-colors block">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-2">
                  <Upload className="w-5 h-5" />
                </div>
                <p className="text-xs font-bold text-slate-800">
                  {isUploadingBanner ? 'Uploading image...' : 'Click to upload or drag & drop activity promotional banner'}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Recommended: 1920x1080 (16:9), PNG or JPG up to 5MB
                </p>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleBannerFileChange}
                  disabled={isUploadingBanner}
                  className="hidden"
                />
              </label>
            )}
          </div>

          {/* Section 3: Required Target Participant Filters (Operational Mobile Feed Control) */}
          <OperationalAudienceSelector
            audienceScope={targetAudienceScope}
            academicLevel={targetAcademicLevel}
            targetCourses={targetCourses}
            targetYearLevels={targetYearLevels}
            targetSections={targetSections}
            onChangeScope={setTargetAudienceScope}
            onChangeAcademicLevel={setTargetAcademicLevel}
            onChangeCourses={setTargetCourses}
            onChangeYearLevels={setTargetYearLevels}
            onChangeSections={setTargetSections}
            readOnly={readOnly}
            hasHostingOrg={Boolean((activity as any).hostingOrgId && (activity as any).hostingOrgId !== 'sas')}
            title="Target Participant Filters"
            subtitle="Choose which students will see and participate in this activity on the STI Sync Mobile App."
            reachLabel="students will see this in their mobile feed"
          />
        </div>

        {/* Footer */}
        <div className="bg-slate-100 border-t border-slate-200 px-6 py-4 flex items-center justify-end gap-2 flex-shrink-0">
          {readOnly ? (
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 bg-[#001A4D] hover:bg-[#002D72] text-[#FFD41C] text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer"
            >
              Close (Read Only)
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="px-5 py-2.5 bg-[#001A4D] hover:bg-[#002D72] text-[#FFD41C] text-xs font-bold rounded-xl shadow-xs inline-flex items-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>{isSaving ? 'Saving & Publishing...' : 'Save & Publish Activity'}</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
