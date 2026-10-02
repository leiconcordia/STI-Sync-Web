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
  Calendar,
  BookOpen,
  Check,
  Save,
  Trash2,
  Users,
  Lock,
} from 'lucide-react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import { ACTIVITIES_COLLECTION } from '../services/event.service';
import type { EventDocument } from '../types/event.types';
import { uploadToCloudinary } from '../../../../services/cloudinary';
import { useCourses } from '../../academic/hooks/useAcademicStream';
import { toast } from 'sonner';

interface PublishStudentFeedModalProps {
  isOpen: boolean;
  onClose: () => void;
  activity: EventDocument;
  onUpdated?: () => void;
  readOnly?: boolean;
}

const YEAR_LEVELS = ['Grade 11', 'Grade 12', '1st Year', '2nd Year', '3rd Year', '4th Year'];

export default function PublishStudentFeedModal({
  isOpen,
  onClose,
  activity,
  onUpdated,
  readOnly = false,
}: PublishStudentFeedModalProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);

  const { data: courses = [] } = useCourses();

  // State
  const [bannerUrl, setBannerUrl] = useState<string>(activity.bannerImageUrl || '');
  const [visibleToStudents, setVisibleToStudents] = useState<boolean>(
    activity.visibleToStudents ?? activity.isVisible ?? true
  );
  const [visibilityDate, setVisibilityDate] = useState<string>(
    typeof activity.visibilityStart === 'string' ? activity.visibilityStart : ''
  );
  const [targetAcademicLevel, setTargetAcademicLevel] = useState<'COLLEGE' | 'SHS' | 'BOTH'>(
    activity.targetAcademicLevel || 'BOTH'
  );
  const [targetCourses, setTargetCourses] = useState<string[]>(
    activity.targetCourses || []
  );
  const [targetYearLevels, setTargetYearLevels] = useState<string[]>(
    activity.targetYearLevels || []
  );

  useEffect(() => {
    if (activity) {
      setBannerUrl(activity.bannerImageUrl || '');
      setVisibleToStudents(activity.visibleToStudents ?? activity.isVisible ?? true);
      setVisibilityDate(
        typeof activity.visibilityStart === 'string' ? activity.visibilityStart : ''
      );
      setTargetAcademicLevel(activity.targetAcademicLevel || 'BOTH');
      setTargetCourses(activity.targetCourses || []);
      setTargetYearLevels(activity.targetYearLevels || []);
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

  // Save Settings
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const docRef = doc(db, ACTIVITIES_COLLECTION, activity.id);
      await updateDoc(docRef, {
        bannerImageUrl: bannerUrl || null,
        visibleToStudents,
        isVisible: visibleToStudents,
        visibilityStart: visibilityDate || null,
        targetAcademicLevel,
        targetCourses,
        targetYearLevels,
        updatedAt: serverTimestamp(),
      });

      toast.success('Mobile feed and audience settings updated successfully!');
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

          {/* Section 1: Mobile App Visibility Toggle */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h4 className="text-xs font-bold text-slate-900">Show Activity in Student Feed</h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Controls if this activity appears in the STI Sync mobile app and student event discovery.
                </p>
              </div>
              <label className={`relative inline-flex items-center ${readOnly ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
                <input
                  type="checkbox"
                  disabled={readOnly}
                  checked={visibleToStudents}
                  onChange={(e) => setVisibleToStudents(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
              </label>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                <span>Scheduled Publish Date & Time</span>
              </label>
              <input
                type="datetime-local"
                disabled={readOnly}
                value={visibilityDate}
                onChange={(e) => setVisibilityDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60 disabled:cursor-not-allowed"
              />
              <p className="text-[10px] text-slate-400 mt-1">Leave empty to make the activity visible immediately upon saving.</p>
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

          {/* Section 3: Target Audience & Academic Filters */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Target Audience Scope & Academic Filters
            </h4>

            {/* Academic Division */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1.5">
                Academic Division
              </label>
              <div className="grid grid-cols-3 gap-2.5">
                {(['COLLEGE', 'SHS', 'BOTH'] as const).map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    disabled={readOnly}
                    onClick={() => setTargetAcademicLevel(lvl)}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all text-center ${
                      readOnly ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'
                    } ${
                      targetAcademicLevel === lvl
                        ? 'bg-[#001A4D] text-[#FFD41C] border-[#001A4D] shadow-xs'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {lvl === 'BOTH' ? 'SHS & College' : lvl}
                  </button>
                ))}
              </div>
            </div>

            {/* Programs / Strands */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] font-bold text-slate-500 uppercase">
                  Eligible Academic Programs / Strands
                </label>
                <span className="text-[11px] text-slate-400">
                  {targetCourses.length === 0 ? 'All programs eligible' : `${targetCourses.length} selected`}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {['BSIT', 'BSCS', 'BSHM', 'BSTM', 'BSBA', 'BSA', 'STEM', 'ABM', 'HUMSS', 'ICT'].map((code) => {
                  const isSelected = targetCourses.includes(code);
                  return (
                    <button
                      key={code}
                      type="button"
                      disabled={readOnly}
                      onClick={() => handleToggleCourse(code)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                        readOnly ? 'cursor-not-allowed opacity-75' : 'cursor-pointer'
                      } ${
                        isSelected
                          ? 'bg-[#0E4EBD] text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3" />}
                      <span>{code}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Year Levels */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] font-bold text-slate-500 uppercase">
                  Target Year Levels
                </label>
                <span className="text-[11px] text-slate-400">
                  {targetYearLevels.length === 0 ? 'All year levels' : `${targetYearLevels.length} selected`}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {YEAR_LEVELS.map((year) => {
                  const isSelected = targetYearLevels.includes(year);
                  return (
                    <label
                      key={year}
                      className={`p-2 rounded-xl border flex items-center gap-2 transition-colors ${
                        readOnly ? 'cursor-not-allowed opacity-75' : 'cursor-pointer'
                      } ${
                        isSelected
                          ? 'bg-blue-50 border-blue-200 text-[#001A4D] font-bold'
                          : 'bg-slate-50 border-slate-200 text-slate-700'
                      }`}
                    >
                      <input
                        type="checkbox"
                        disabled={readOnly}
                        checked={isSelected}
                        onChange={() => handleToggleYearLevel(year)}
                        className="accent-[#001A4D] w-4 h-4 rounded"
                      />
                      <span className="text-xs">{year}</span>
                    </label>
                  );
                })}
              </div>
            </div>
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
                <span>{isSaving ? 'Saving...' : 'Save Feed & Audience'}</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
