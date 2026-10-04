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

const SHS_STRANDS = ['STEM', 'ABM', 'HUMSS', 'GAS', 'TVL-ICT', 'TVL-HE', 'TVL-IA', 'ICT'];
const COLLEGE_COURSES = ['BSIT', 'BSCS', 'BSCPE', 'BSHM', 'BSTM', 'BSA', 'BSAIS', 'BSBA'];

const SHS_YEAR_LEVELS = ['Grade 11', 'Grade 12'];
const COLLEGE_YEAR_LEVELS = ['1st Year', '2nd Year', '3rd Year', '4th Year'];
const ALL_YEAR_LEVELS = [...SHS_YEAR_LEVELS, ...COLLEGE_YEAR_LEVELS];

export default function PublishStudentFeedModal({
  isOpen,
  onClose,
  activity,
  onUpdated,
  readOnly = false,
}: PublishStudentFeedModalProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);

  const { data: fetchedCourses = [] } = useCourses();

  // State
  const [bannerUrl, setBannerUrl] = useState<string>(activity.bannerImageUrl || '');
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

  // Academic Division Change with automatic pruning
  const handleAcademicLevelChange = (lvl: 'COLLEGE' | 'SHS' | 'BOTH') => {
    setTargetAcademicLevel(lvl);
    if (lvl === 'SHS') {
      setTargetCourses((prev) => prev.filter((c) => SHS_STRANDS.includes(c)));
      setTargetYearLevels((prev) => prev.filter((y) => SHS_YEAR_LEVELS.includes(y)));
    } else if (lvl === 'COLLEGE') {
      setTargetCourses((prev) => prev.filter((c) => COLLEGE_COURSES.includes(c)));
      setTargetYearLevels((prev) => prev.filter((y) => COLLEGE_YEAR_LEVELS.includes(y)));
    }
  };

  // Course Toggle with automatic year level pruning
  const handleToggleCourse = (courseCode: string) => {
    setTargetCourses((prev) => {
      const nextCourses = prev.includes(courseCode)
        ? prev.filter((c) => c !== courseCode)
        : [...prev, courseCode];

      if (nextCourses.length > 0) {
        const hasCollegeOnly = nextCourses.every((c) => COLLEGE_COURSES.includes(c));
        const hasShsOnly = nextCourses.every((c) => SHS_STRANDS.includes(c));

        if (hasCollegeOnly) {
          setTargetYearLevels((prevYears) => prevYears.filter((y) => !SHS_YEAR_LEVELS.includes(y)));
        } else if (hasShsOnly) {
          setTargetYearLevels((prevYears) => prevYears.filter((y) => !COLLEGE_YEAR_LEVELS.includes(y)));
        }
      }

      return nextCourses;
    });
  };

  // Year Level Toggle
  const handleToggleYearLevel = (year: string) => {
    setTargetYearLevels((prev) =>
      prev.includes(year)
        ? prev.filter((y) => y !== year)
        : [...prev, year]
    );
  };

  // Save Settings (Automatically publishes approved activity on save)
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const docRef = doc(db, ACTIVITIES_COLLECTION, activity.id);
      await updateDoc(docRef, {
        bannerImageUrl: bannerUrl || null,
        visibleToStudents: true,
        isVisible: true,
        visibilityStart: null,
        targetAcademicLevel,
        targetCourses,
        targetYearLevels,
        updatedAt: serverTimestamp(),
      });

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

  // Available courses/strands based on targetAcademicLevel
  const availableCourses =
    targetAcademicLevel === 'SHS'
      ? SHS_STRANDS
      : targetAcademicLevel === 'COLLEGE'
      ? COLLEGE_COURSES
      : [...COLLEGE_COURSES, ...SHS_STRANDS];

  // Check if selected courses prune year levels
  const selectedAreCollegeOnly =
    targetCourses.length > 0 && targetCourses.every((c) => COLLEGE_COURSES.includes(c));
  const selectedAreShsOnly =
    targetCourses.length > 0 && targetCourses.every((c) => SHS_STRANDS.includes(c));

  // Available year levels based on targetAcademicLevel & selected courses
  const availableYearLevels =
    targetAcademicLevel === 'SHS' || selectedAreShsOnly
      ? SHS_YEAR_LEVELS
      : targetAcademicLevel === 'COLLEGE' || selectedAreCollegeOnly
      ? COLLEGE_YEAR_LEVELS
      : ALL_YEAR_LEVELS;

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

          {/* Section 3: Target Audience Scope & Academic Filters */}
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
                    onClick={() => handleAcademicLevelChange(lvl)}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all text-center ${
                      readOnly ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'
                    } ${
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

            {/* Programs / Strands */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] font-bold text-slate-500 uppercase">
                  Eligible Academic Programs / Strands ({targetAcademicLevel})
                </label>
                <span className="text-[11px] text-slate-400">
                  {targetCourses.length === 0 ? 'All programs in division eligible' : `${targetCourses.length} selected`}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {availableCourses.map((code) => {
                  const isSelected = targetCourses.includes(code);
                  const isShs = SHS_STRANDS.includes(code);
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
                          ? isShs
                            ? 'bg-amber-600 text-white shadow-2xs'
                            : 'bg-[#0E4EBD] text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3" />}
                      <span>{code}</span>
                      <span className="text-[9px] opacity-75 font-normal">
                        ({isShs ? 'SHS' : 'College'})
                      </span>
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
                  {targetYearLevels.length === 0 ? 'All year levels in scope' : `${targetYearLevels.length} selected`}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {availableYearLevels.map((year) => {
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
                <span>{isSaving ? 'Saving & Publishing...' : 'Save & Publish Activity'}</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
