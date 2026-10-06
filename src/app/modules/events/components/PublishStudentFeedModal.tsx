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
  Image as ImageIcon,
  BookOpen,
  Check,
  Save,
  Trash2,
  Users,
  Lock,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  SlidersHorizontal,
  CheckSquare,
} from 'lucide-react';
import { doc, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import { ACTIVITIES_COLLECTION } from '../services/event.service';
import type { EventDocument } from '../types/event.types';
import { uploadToCloudinary } from '../../../../services/cloudinary';
import { useTargetAudienceStructure, type DynamicProgram } from '../../academic';
import { toast } from 'sonner';

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

  // Fetch real programs / strands and year levels dynamically from database
  const audienceStructure = useTargetAudienceStructure();

  // State
  const [bannerUrl, setBannerUrl] = useState<string>(activity.bannerImageUrl || '');
  const [targetAcademicLevel, setTargetAcademicLevel] = useState<'COLLEGE' | 'SHS' | 'BOTH'>('BOTH');
  const [targetCourses, setTargetCourses] = useState<string[]>([]);
  const [targetYearLevels, setTargetYearLevels] = useState<string[]>([]);
  const [showCustomAudience, setShowCustomAudience] = useState<boolean>(false);

  // Pre-load / inherit settings directly from proposal (Zero re-selection required)
  useEffect(() => {
    if (activity) {
      setBannerUrl(activity.bannerImageUrl || '');

      // Inherit academic division
      let inheritedLevel: 'COLLEGE' | 'SHS' | 'BOTH' = 'BOTH';
      if (activity.targetAcademicLevel) {
        inheritedLevel = activity.targetAcademicLevel as any;
      } else if ((activity as any).targetAudience?.academicLevels) {
        const lvls: string[] = (activity as any).targetAudience.academicLevels;
        if (lvls.includes('SHS') && lvls.includes('College')) inheritedLevel = 'BOTH';
        else if (lvls.includes('SHS')) inheritedLevel = 'SHS';
        else if (lvls.includes('College')) inheritedLevel = 'COLLEGE';
      }
      setTargetAcademicLevel(inheritedLevel);

      // Inherit courses / strands
      const inheritedCourses: string[] =
        activity.targetCourses && activity.targetCourses.length > 0
          ? activity.targetCourses
          : (activity as any).targetAudience?.courseCodes || [];
      setTargetCourses(inheritedCourses);

      // Inherit year levels
      const inheritedYears: string[] =
        activity.targetYearLevels && activity.targetYearLevels.length > 0
          ? activity.targetYearLevels
          : ((activity as any).targetAudience?.yearLevels || []).map(String);
      setTargetYearLevels(inheritedYears);
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

  // Academic Division Change with automatic cascading default selection
  const handleAcademicLevelChange = (lvl: 'COLLEGE' | 'SHS' | 'BOTH') => {
    setTargetAcademicLevel(lvl);
    if (lvl === 'SHS') {
      setTargetCourses(audienceStructure.shsCourseCodes);
      setTargetYearLevels(audienceStructure.shsYearLevels);
    } else if (lvl === 'COLLEGE') {
      setTargetCourses(audienceStructure.collegeCourseCodes);
      setTargetYearLevels(audienceStructure.collegeYearLevels);
    } else {
      setTargetCourses(audienceStructure.allCourseCodes);
      setTargetYearLevels(audienceStructure.allYearLevels);
    }
  };

  // Course Toggle
  const handleToggleCourse = (courseCode: string) => {
    setTargetCourses((prev) =>
      prev.includes(courseCode)
        ? prev.filter((c) => c !== courseCode)
        : [...prev, courseCode]
    );
  };

  // Year Level Toggle
  const handleToggleYearLevel = (year: string) => {
    setTargetYearLevels((prev) =>
      prev.includes(year)
        ? prev.filter((y) => y !== year)
        : [...prev, year]
    );
  };

  // Dynamic lists from database based on selected academic division
  const availablePrograms = audienceStructure.getProgramsForAcademicLevel(targetAcademicLevel);
  const availableYearLevels = audienceStructure.getYearLevelsForAcademicLevel(targetAcademicLevel);

  const selectAllPrograms = () => {
    setTargetCourses(availablePrograms.map((p) => p.code));
  };

  const clearAllPrograms = () => {
    setTargetCourses([]);
  };

  const selectAllYearLevels = () => {
    setTargetYearLevels(availableYearLevels);
  };

  const clearAllYearLevels = () => {
    setTargetYearLevels([]);
  };

  // Save Settings (Automatically publishes approved activity on save)
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const targetAudienceUpdated = {
        ...((activity as any).targetAudience || {}),
        allStudents: targetAcademicLevel === 'BOTH' && targetCourses.length === 0,
        academicLevels:
          targetAcademicLevel === 'BOTH'
            ? ['College', 'SHS']
            : targetAcademicLevel === 'SHS'
            ? ['SHS']
            : ['College'],
        courseCodes: targetCourses,
        yearLevels: targetYearLevels,
      };

      const payload = {
        bannerImageUrl: bannerUrl || null,
        visibleToStudents: true,
        isVisible: true,
        isPublished: true,
        lifecycleStatus: 'published',
        visibilityStart: null,
        targetAcademicLevel,
        targetCourses,
        targetYearLevels,
        targetAudience: targetAudienceUpdated,
        updatedAt: serverTimestamp(),
      };

      const docRef = doc(db, ACTIVITIES_COLLECTION, activity.id);
      await updateDoc(docRef, payload);

      // Dual-sync complete activity metadata to events collection for mobile app
      try {
        const eventDocRef = doc(db, 'events', activity.id);
        const eventPayload: Record<string, any> = {
          ...payload,
          id: activity.id,
          referenceId: activity.referenceId || (activity as any).referenceNo || '',
          title: activity.title || '',
          description: activity.description || '',
          targetAudienceScope: (activity as any).targetAudienceScope || 'all',
          date: activity.date || (activity as any).startDate || '',
          startDate: (activity as any).startDate || activity.date || '',
          startTime: (activity as any).startTime || '08:00',
          endTime: (activity as any).endTime || '12:00',
          venueName: (activity as any).venueName || (activity as any).customVenueName || 'STI Campus',
          customVenueName: (activity as any).customVenueName || (activity as any).venueName || 'STI Campus',
          venueId: (activity as any).venueId || 'campus_venue',
          eventFormat: (activity as any).eventFormat || 'On-Campus',
          hostingOrgId: (activity as any).hostingOrgId || (activity as any).organizationId || '',
          sessions: activity.sessions || [],
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

          {/* Section 3: Target Audience Scope & Academic Filters (Pre-configured from Form AP-01 Proposal) */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <div className="flex items-start gap-2.5">
                <div className="w-7 h-7 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                      Target Audience Scope & Academic Filters
                    </h4>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                      Pre-Configured in Proposal
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Target scope and academic eligibility criteria were established during proposal submission (Form AP-01). No manual selection required.
                  </p>
                </div>
              </div>

              {!readOnly && (
                <button
                  type="button"
                  onClick={() => setShowCustomAudience((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer self-start sm:self-auto"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>{showCustomAudience ? 'Hide Advanced Filters' : 'Adjust Filters (Optional)'}</span>
                  {showCustomAudience ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>

            {/* Pre-Configured Audience Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Academic Division */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Academic Division</p>
                <p className="text-xs font-bold text-slate-900 mt-1">
                  {targetAcademicLevel === 'BOTH'
                    ? 'Senior High & College'
                    : targetAcademicLevel === 'SHS'
                    ? 'Senior High School (SHS)'
                    : 'College Division Only'}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  {targetAcademicLevel === 'BOTH'
                    ? 'Open to both collegiate and basic ed tracks'
                    : `Restricted to ${targetAcademicLevel} students`}
                </p>
              </div>

              {/* Eligible Programs / Strands */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Programs / Strands</p>
                  <span className="text-[10px] font-mono text-slate-500">
                    {targetCourses.length === 0 ? 'All' : `${targetCourses.length} selected`}
                  </span>
                </div>
                {targetCourses.length === 0 ? (
                  <p className="text-xs font-bold text-slate-900 mt-1">
                    All Academic Programs & Strands
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1 mt-1.5 max-h-16 overflow-y-auto">
                    {targetCourses.map((c) => (
                      <span
                        key={c}
                        className="px-2 py-0.5 rounded-md bg-blue-100 text-[#001A4D] font-bold text-[10px]"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                )}
                <p className="text-[10px] text-slate-500 mt-1">
                  {targetCourses.length === 0 ? 'Campus-wide audience scope' : 'Restricted to selected academic programs'}
                </p>
              </div>

              {/* Target Year Levels */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Target Year Levels</p>
                  <span className="text-[10px] font-mono text-slate-500">
                    {targetYearLevels.length === 0 ? 'All' : `${targetYearLevels.length} selected`}
                  </span>
                </div>
                {targetYearLevels.length === 0 ? (
                  <p className="text-xs font-bold text-slate-900 mt-1">
                    All Year Levels In Scope
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1 mt-1.5 max-h-16 overflow-y-auto">
                    {targetYearLevels.map((y) => (
                      <span
                        key={y}
                        className="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-900 font-bold text-[10px]"
                      >
                        {y}
                      </span>
                    ))}
                  </div>
                )}
                <p className="text-[10px] text-slate-500 mt-1">
                  {targetYearLevels.length === 0 ? 'Open across all academic year levels' : 'Designated cohort levels'}
                </p>
              </div>
            </div>

            {/* Optional Collapsible Filter Adjuster */}
            {showCustomAudience && !readOnly && (
              <div className="pt-4 border-t border-slate-200/70 space-y-4 animate-in fade-in duration-200">
                <div className="bg-blue-50/60 border border-blue-200 rounded-xl p-3 text-xs text-blue-900 flex items-center justify-between">
                  <span className="text-[11px] font-medium">
                    You can override the proposal's targeting filters below if specific adjustments are required before publishing.
                  </span>
                </div>

                {/* Academic Division */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1.5">
                    Override Academic Division
                  </label>
                  <div className="grid grid-cols-3 gap-2.5">
                    {(['COLLEGE', 'SHS', 'BOTH'] as const).map((lvl) => (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => handleAcademicLevelChange(lvl)}
                        className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all text-center cursor-pointer ${
                          targetAcademicLevel === lvl
                            ? 'bg-[#001A4D] text-[#FFD41C] border-[#001A4D] shadow-xs'
                            : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {lvl === 'BOTH' ? 'SHS & College' : lvl === 'SHS' ? 'Senior High (SHS)' : 'College Only'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 1. Target Year Levels */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] font-bold text-slate-500 uppercase">
                      Target Year Levels ({targetYearLevels.length === 0 ? 'All year levels in scope' : `${targetYearLevels.length} of ${availableYearLevels.length} selected`})
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={selectAllYearLevels}
                        className="text-xs text-[#001A4D] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <CheckSquare className="w-3.5 h-3.5" /> Select All ({availableYearLevels.length})
                      </button>
                      <span className="text-gray-300">|</span>
                      <button
                        type="button"
                        onClick={clearAllYearLevels}
                        className="text-xs text-gray-500 hover:text-gray-700 font-medium cursor-pointer"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {availableYearLevels.map((year) => {
                      const isSelected = targetYearLevels.includes(year);
                      return (
                        <button
                          key={year}
                          type="button"
                          onClick={() => handleToggleYearLevel(year)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1.5 ${
                            isSelected
                              ? 'bg-[#001A4D] text-[#FFD41C] border-[#001A4D] shadow-xs'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-[#001A4D] hover:bg-slate-100'
                          }`}
                        >
                          <span>{year}</span>
                          {isSelected && <Check className="w-3 h-3 text-[#FFD41C]" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Eligible Programs / Strands */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] font-bold text-slate-500 uppercase">
                      Eligible Academic Programs / Strands ({targetCourses.length === 0 ? 'All programs in division eligible' : `${targetCourses.length} of ${availablePrograms.length} selected`})
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={selectAllPrograms}
                        className="text-xs text-[#001A4D] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <CheckSquare className="w-3.5 h-3.5" /> Select All ({availablePrograms.length})
                      </button>
                      <span className="text-gray-300">|</span>
                      <button
                        type="button"
                        onClick={clearAllPrograms}
                        className="text-xs text-gray-500 hover:text-gray-700 font-medium cursor-pointer"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {availablePrograms.map((p) => {
                      const isSelected = targetCourses.includes(p.code);
                      const isShs = p.academicLevel === 'SHS';
                      return (
                        <button
                          key={p.id || p.code}
                          type="button"
                          onClick={() => handleToggleCourse(p.code)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all flex items-center gap-1.5 cursor-pointer ${
                            isSelected
                              ? 'bg-[#001A4D] text-[#FFD41C] border-[#001A4D] shadow-xs'
                              : 'bg-slate-100 text-slate-700 border-slate-200 hover:border-[#001A4D] hover:bg-slate-200'
                          }`}
                        >
                          <span>{p.code}</span>
                          <span className="text-[10px] opacity-75 font-normal">
                            ({isShs ? 'SHS' : 'College'}: {p.name})
                          </span>
                          {isSelected && <Check className="w-3 h-3 text-[#FFD41C]" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
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
