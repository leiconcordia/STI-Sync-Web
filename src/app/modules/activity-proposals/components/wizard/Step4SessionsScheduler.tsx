/**
 * src/app/modules/activity-proposals/components/wizard/Step4SessionsScheduler.tsx
 *
 * Section 12: Date & time (and Venue)
 * Single session date and operational hours.
 * Venues are loaded exclusively from the Firestore database (no hardcoded data).
 * If a venue doesn't exist, users can add it via "Add New Venue" and it is saved directly to the database.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar,
  Clock,
  MapPin,
  Building,
  Plus,
  X,
  AlertCircle,
  CheckCircle2,
  Building2,
  Info,
  Zap,
  AlertTriangle,
  Lock,
  Unlock,
} from 'lucide-react';
import { toast } from 'sonner';
import { format, addDays, differenceInCalendarDays, parseISO, isValid } from 'date-fns';
import { useVenuesStream } from '../../../events/hooks/useEventConfigStream';
import { createVenue } from '../../../events/services/event-config.service';
import type { ProposalFormData, ProposalSession } from '../../types/proposal.types';

interface Step4Props {
  formData: ProposalFormData;
  onChange: (updates: Partial<ProposalFormData>) => void;
  errors?: Record<string, string>;
}

const COMMON_FACILITIES = [
  'Projector',
  'Air Conditioning',
  'Sound System',
  'Stage / Podium',
  'WiFi / LAN',
  'Whiteboard',
];

export default function Step4SessionsScheduler({ formData, onChange, errors = {} }: Step4Props) {
  // Fetch venues from Firestore database only (no hardcoded data)
  const { venues, loading: venuesLoading } = useVenuesStream();
  const availableVenues = useMemo(() => venues.filter((v) => !v.archived), [venues]);

  // Lead time calculations
  const todayStr = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);
  const standardMinDate = useMemo(() => format(addDays(new Date(), 15), 'yyyy-MM-dd'), []);

  const isUrgent = Boolean(formData.isUrgent);
  const urgentJustification = formData.urgentJustification || '';
  const effectiveMinDate = isUrgent ? todayStr : standardMinDate;

  // Single date and time state
  const singleSession = formData.sessions?.[0] || {
    id: 'main-session',
    title: formData.title || 'Main Program',
    date: formData.date || '',
    startTime: formData.startTime || '08:00',
    endTime: formData.endTime || '12:00',
    venueName: formData.venueName || '',
    venueId: formData.venueId || '',
  };

  const [date, setDate] = useState(formData.date || singleSession.date || '');
  const [startTime, setStartTime] = useState(singleSession.startTime || '');
  const [endTime, setEndTime] = useState(singleSession.endTime || '');
  const [includeTime, setIncludeTime] = useState<boolean>(Boolean(singleSession.startTime && singleSession.endTime));
  const [venueId, setVenueId] = useState(singleSession.venueId || '');
  const [venueName, setVenueName] = useState(singleSession.venueName || '');
  const [venueType, setVenueType] = useState<'inside' | 'outside'>(formData.venueType || (formData.venueId ? 'inside' : 'inside'));

  // Keep local state synchronized with incoming formData (e.g., when navigating between steps)
  useEffect(() => {
    const parentDate = formData.date || formData.sessions?.[0]?.date || '';
    if (parentDate && parentDate !== date) {
      setDate(parentDate);
    }
    const parentStart = formData.startTime || formData.sessions?.[0]?.startTime || '';
    if (parentStart !== startTime) setStartTime(parentStart);
    const parentEnd = formData.endTime || formData.sessions?.[0]?.endTime || '';
    if (parentEnd !== endTime) setEndTime(parentEnd);

    const parentVId = formData.venueId || formData.sessions?.[0]?.venueId || '';
    if (parentVId !== venueId) setVenueId(parentVId);

    const parentVName = formData.venueName || formData.sessions?.[0]?.venueName || '';
    if (parentVName !== venueName) setVenueName(parentVName);

    const parentVType = formData.venueType || 'inside';
    if (parentVType !== venueType) setVenueType(parentVType);
  }, [
    formData.date,
    formData.sessions,
    formData.startTime,
    formData.endTime,
    formData.venueId,
    formData.venueName,
    formData.venueType,
  ]);

  // Calculate lead-time days from today to selected date
  const leadTimeDays = useMemo(() => {
    if (!date) return null;
    const parsed = parseISO(date);
    if (!isValid(parsed)) return null;
    return differenceInCalendarDays(parsed, new Date());
  }, [date]);

  // Add Venue Modal / Dialog state
  const [showAddVenueModal, setShowAddVenueModal] = useState(false);
  const [newVenueName, setNewVenueName] = useState('');
  const [newVenueLocationType, setNewVenueLocationType] = useState<'inside' | 'outside'>('inside');
  const [isSavingVenue, setIsSavingVenue] = useState(false);

  // Sync back to formData
  const syncToFormData = (
    updatedDate: string,
    updatedStart: string,
    updatedEnd: string,
    updatedVId: string,
    updatedVName: string,
    vType: 'inside' | 'outside' = venueType,
    explicitIsUrgent?: boolean
  ) => {
    // If the selected date is valid and compliant (>= 15 days), isUrgent MUST be false
    let nextIsUrgent = explicitIsUrgent !== undefined ? explicitIsUrgent : isUrgent;
    if (updatedDate) {
      const parsed = parseISO(updatedDate);
      if (isValid(parsed)) {
        const diff = differenceInCalendarDays(parsed, new Date());
        if (diff >= 15) {
          nextIsUrgent = false;
        }
      }
    }

    onChange({
      date: updatedDate,
      startTime: updatedStart,
      endTime: updatedEnd,
      venueId: updatedVId,
      venueName: updatedVName,
      venueType: vType,
      customVenueName: vType === 'outside' ? updatedVName : '',
      isUrgent: nextIsUrgent,
      urgentJustification: nextIsUrgent ? urgentJustification : '',
      sessions: [
        {
          id: 'main-session',
          title: formData.title || 'Main Program',
          date: updatedDate,
          startTime: updatedStart,
          endTime: updatedEnd,
          venueName: updatedVName,
          venueId: updatedVId,
        },
      ],
    });
  };

  const handleDateChange = (val: string) => {
    setDate(val);
    syncToFormData(val, includeTime ? startTime : '', includeTime ? endTime : '', venueId, venueName, venueType);
  };

  const handleToggleUrgent = (checked: boolean) => {
    if (!checked) {
      // If turning off urgent, check if current date is below 15 days
      const willBeInvalid = date && date < standardMinDate;
      const nextDate = willBeInvalid ? '' : date;
      if (willBeInvalid) {
        setDate('');
        toast.info(`Urgent mode disabled. Please pick a date at least 15 days in advance (${standardMinDate} or later).`);
      }
      syncToFormData(nextDate, includeTime ? startTime : '', includeTime ? endTime : '', venueId, venueName, venueType, false);
    } else {
      syncToFormData(date, includeTime ? startTime : '', includeTime ? endTime : '', venueId, venueName, venueType, true);
      toast.warning('Urgent Filing Mode enabled. Dates under 15 days are unlocked. Please provide a justification below.');
    }
  };

  const handleJustificationChange = (text: string) => {
    onChange({
      isUrgent: true,
      urgentJustification: text,
    });
  };

  const handleStartTimeChange = (val: string) => {
    setStartTime(val);
    syncToFormData(date, val, endTime, venueId, venueName, venueType);
  };

  const handleEndTimeChange = (val: string) => {
    setEndTime(val);
    syncToFormData(date, startTime, val, venueId, venueName, venueType);
  };

  const handleVenueChange = (selectedId: string) => {
    if (selectedId === '__add_new__') {
      setNewVenueName('');
      setNewVenueLocationType('inside');
      setShowAddVenueModal(true);
      return;
    }

    const found = availableVenues.find((v) => v.id === selectedId);
    const vName = found ? found.name : '';
    const vType = (found?.venueType === 'outside' || (found as any)?.locationType === 'outside') ? 'outside' : 'inside';
    setVenueId(selectedId);
    setVenueName(vName);
    setVenueType(vType);
    syncToFormData(date, includeTime ? startTime : '', includeTime ? endTime : '', selectedId, vName, vType);
  };

  // Save new venue to database
  const handleCreateVenue = async () => {
    const trimmed = newVenueName.trim();
    if (!trimmed) {
      toast.error('Please enter a venue name.');
      return;
    }

    setIsSavingVenue(true);
    try {
      const created = await createVenue({
        name: trimmed,
        venueType: newVenueLocationType,
        status: 'available',
        isCustom: false,
      });

      toast.success(`Venue "${trimmed}" added successfully!`);
      setShowAddVenueModal(false);
      setNewVenueName('');

      // Auto-select the newly created venue
      setVenueType(newVenueLocationType);
      setVenueId(created.id);
      setVenueName(trimmed);
      syncToFormData(date, includeTime ? startTime : '', includeTime ? endTime : '', created.id, trimmed, newVenueLocationType);
    } catch (err: any) {
      console.error('Failed to save venue:', err);
      toast.error(err?.message || 'Failed to add venue.');
    } finally {
      setIsSavingVenue(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-blue-100 text-[#001A4D] flex items-center justify-center font-bold text-xs">
            12
          </div>
          <div>
            <label className="text-xs font-bold text-gray-800 uppercase tracking-wider block">
              Date & time (and Venue) <span className="text-red-500">*</span>
            </label>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Activity proposal schedule and campus location.
            </p>
          </div>
        </div>
      </div>

      {/* Informational Guidance Banner */}
      <div className="p-3.5 bg-blue-50/80 border border-blue-200 rounded-2xl flex items-start gap-3">
        <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-blue-950 space-y-1">
          <p className="font-bold">
            Activity Target Schedule & Lead Time Policy
          </p>
          <p className="text-blue-800 leading-relaxed font-normal">
            Official STI College policy requires proposals to be filed at least <strong>15 calendar days</strong> in advance. Dates below 15 days are automatically disabled on the date picker unless you activate the <strong>Urgent Activity Proposal</strong> slider below with an administrative justification.
          </p>
        </div>
      </div>

      {/* Validation Error banner if any */}
      {(errors.sessions || errors.date) && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{errors.sessions || errors.date}</span>
        </div>
      )}

      {/* Schedule & Venue Card */}
      <div className="border border-gray-200 rounded-2xl p-6 bg-white shadow-xs space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
          {/* Target Implementation Date */}
          <div className="md:col-span-12 space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
              <label className="block text-xs font-bold text-gray-800 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-blue-600" />
                <span>Target Implementation Date <span className="text-red-500">*</span></span>
              </label>
              <span className="text-[11px] text-slate-500 font-medium">
                {isUrgent ? (
                  <span className="text-amber-700 font-semibold flex items-center gap-1">
                    <Unlock className="w-3.5 h-3.5 text-amber-600" />
                    Urgent Mode: Selectable from Today ({todayStr}) onwards
                  </span>
                ) : (
                  <span className="text-slate-600 flex items-center gap-1">
                    <Lock className="w-3.5 h-3.5 text-slate-400" />
                    Standard Mode: Earliest allowed date is <strong>{standardMinDate}</strong> (15+ days)
                  </span>
                )}
              </span>
            </div>

            <div className="relative">
              <input
                type="date"
                min={effectiveMinDate}
                value={date}
                onChange={(e) => handleDateChange(e.target.value)}
                className={`w-full px-3.5 py-2.5 bg-gray-50/50 border rounded-xl text-xs focus:ring-2 focus:ring-[#001A4D]/20 focus:border-[#001A4D] text-gray-900 font-semibold transition-all ${
                  errors.date ? 'border-red-400 bg-red-50/20' : 'border-gray-300'
                }`}
              />
            </div>

            {/* Live Feedback Badges for Selected Date */}
            {leadTimeDays !== null && (
              <div className="pt-1 flex items-center gap-2 flex-wrap">
                {leadTimeDays >= 15 ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-300 text-xs font-semibold shadow-2xs">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>✓ 15-Day Policy Compliant ({leadTimeDays} calendar days advance notice)</span>
                  </span>
                ) : leadTimeDays >= 0 ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-900 border border-amber-300 text-xs font-semibold shadow-2xs">
                    <Zap className="w-3.5 h-3.5 text-amber-600" />
                    <span>⚡ Urgent Fast-Track ({leadTimeDays} calendar days lead time — justification required)</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-50 text-red-800 border border-red-300 text-xs font-semibold">
                    <AlertCircle className="w-3.5 h-3.5 text-red-600" />
                    <span>Invalid: Date is in the past</span>
                  </span>
                )}
              </div>
            )}

            {errors.date && (
              <p className="text-[11px] text-red-600 font-semibold flex items-center gap-1 mt-1">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>{errors.date}</span>
              </p>
            )}
            <p className="text-[11px] text-gray-500">
              The proposed calendar date the activity is scheduled to take place on campus.
            </p>
          </div>

          {/* ── URGENT PROPOSAL TOGGLE & JUSTIFICATION SECTION (TRANSFERRED FROM STEP 7) ── */}
          <div className="md:col-span-12">
            <div
              className={`p-4 rounded-2xl border transition-all ${
                isUrgent
                  ? 'bg-amber-50/90 border-amber-300 ring-2 ring-amber-400/20 shadow-xs'
                  : 'bg-slate-50/80 border-slate-200'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${
                      isUrgent ? 'bg-amber-500 text-white shadow-xs' : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    <Zap className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-slate-800">
                        Urgent Activity Proposal (Filing Under 15 Days)
                      </span>
                      {isUrgent ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-200 text-amber-950 border border-amber-300 flex items-center gap-1 shadow-2xs">
                          <Unlock className="w-2.5 h-2.5 text-amber-700" />
                          <span>Urgent Enabled</span>
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-200 text-slate-700">
                          Standard 15+ Days Locked
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
                      Toggle this slider to unlock dates from today ({todayStr}) up to {standardMinDate}. Enabling requires an administrative justification for executive approvers.
                    </p>
                  </div>
                </div>

                {/* Slider Switch */}
                <label className="relative inline-flex items-center cursor-pointer self-end sm:self-center flex-shrink-0">
                  <input
                    type="checkbox"
                    checked={isUrgent}
                    onChange={(e) => handleToggleUrgent(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500 shadow-inner"></div>
                </label>
              </div>

              {/* Justification Textarea (Visible when slider is checked) */}
              {isUrgent && (
                <div className="mt-4 pt-4 border-t border-amber-200/90 space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-1">
                    <label className="block text-xs font-bold text-amber-950 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
                      <span>Urgent Filing Justification <span className="text-red-500">*</span></span>
                    </label>
                    <span className="text-[10px] text-amber-800 font-semibold bg-amber-100 px-2 py-0.5 rounded">
                      Required for Executive Approval
                    </span>
                  </div>
                  <p className="text-[11px] text-amber-900/90 leading-relaxed">
                    Please state the compelling administrative reason or emergency circumstances for expedited filing (e.g., keynote speaker availability, regional competition deadline, sudden institutional calendar adjustment):
                  </p>
                  <textarea
                    rows={3}
                    value={urgentJustification}
                    onChange={(e) => handleJustificationChange(e.target.value)}
                    placeholder="Enter reason why this activity proposal is urgent..."
                    className={`w-full px-3.5 py-2.5 bg-white border rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 transition-all ${
                      errors.urgentJustification
                        ? 'border-red-400 focus:ring-red-400/20 focus:border-red-500'
                        : 'border-amber-300 focus:ring-amber-500/20 focus:border-amber-500'
                    }`}
                  />
                  {errors.urgentJustification && (
                    <p className="text-[11px] text-red-600 font-semibold flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>{errors.urgentJustification}</span>
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Operational Hours Toggle (Optional) */}
          <div className="md:col-span-12 flex items-center justify-between p-3.5 bg-gray-50 rounded-xl border border-gray-200">
            <div>
              <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-blue-600" />
                <span>Specify Operational Hours (Optional)</span>
              </span>
              <p className="text-[11px] text-gray-500 mt-0.5">
                {includeTime ? 'Operational hours active' : 'Time can be left open/flexible or specified here'}
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={includeTime}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setIncludeTime(checked);
                  const newStart = checked ? (startTime || '08:00') : '';
                  const newEnd = checked ? (endTime || '12:00') : '';
                  if (checked && !startTime) setStartTime('08:00');
                  if (checked && !endTime) setEndTime('12:00');
                  syncToFormData(date, newStart, newEnd, venueId, venueName);
                }}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#001A4D]"></div>
            </label>
          </div>

          {includeTime && (
            <>
              {/* Start Time */}
              <div className="md:col-span-6">
                <label className="block text-xs font-semibold text-gray-700 mb-1.5 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-blue-600" />
                  <span>Start Time (Optional)</span>
                </label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => handleStartTimeChange(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-gray-50/50 border border-gray-300 rounded-xl text-xs focus:ring-2 focus:ring-[#001A4D]/20 focus:border-[#001A4D] text-gray-900"
                />
              </div>

              {/* End Time */}
              <div className="md:col-span-6">
                <label className="block text-xs font-semibold text-gray-700 mb-1.5 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-blue-600" />
                  <span>End Time (Optional)</span>
                </label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => handleEndTimeChange(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-gray-50/50 border border-gray-300 rounded-xl text-xs focus:ring-2 focus:ring-[#001A4D]/20 focus:border-[#001A4D] text-gray-900"
                />
              </div>
            </>
          )}

          {/* Venue Specification (with integrated Inside/Outside Location indicator) */}
          <div className="md:col-span-12 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                <Building className="w-4 h-4 text-blue-600" />
                <span>Venue <span className="text-red-500">*</span></span>
              </label>
              <button
                type="button"
                onClick={() => {
                  setNewVenueName('');
                  setNewVenueLocationType('inside');
                  setShowAddVenueModal(true);
                }}
                className="text-xs font-bold text-[#0E4EBD] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add New Venue</span>
              </button>
            </div>

            <select
              value={venueId}
              onChange={(e) => handleVenueChange(e.target.value)}
              disabled={venuesLoading}
              className={`w-full px-3.5 py-2.5 bg-white border rounded-xl text-xs font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#001A4D]/20 focus:border-[#001A4D] transition-all ${
                errors.sessions && !venueName ? 'border-red-400 bg-red-50/20' : 'border-gray-300'
              }`}
            >
              <option value="">
                {venuesLoading ? 'Loading venues...' : 'Select venue...'}
              </option>
              {availableVenues.map((v) => {
                const isOutside = v.venueType === 'outside' || (v as any).locationType === 'outside';
                const tag = isOutside ? 'Outside campus' : 'Inside campus';
                return (
                  <option key={v.id} value={v.id}>
                    {v.name} ({tag})
                  </option>
                );
              })}
              <option value="__add_new__">+ Add New Venue...</option>
            </select>

            {venueName && (
              <div className="mt-2.5 p-3 bg-blue-50/70 border border-blue-200 rounded-xl text-xs text-blue-950 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-[#0E4EBD] flex-shrink-0" />
                  <span>
                    Selected Venue: <strong>{venueName}</strong>{' '}
                    <span className="text-gray-500 font-normal">
                      ({venueType === 'outside' ? 'Outside Campus' : 'Inside Campus'})
                    </span>
                  </span>
                </div>
                <span
                  className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                    venueType === 'outside'
                      ? 'bg-purple-100 text-purple-900 border border-purple-300'
                      : 'bg-blue-100 text-blue-900 border border-blue-300'
                  }`}
                >
                  {venueType === 'outside' ? 'Off-Campus' : 'Campus Verified'}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── ADD NEW VENUE MODAL ── */}
      {showAddVenueModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-200 p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Building className="w-5 h-5 text-[#001A4D]" />
                <h3 className="font-bold text-sm text-[#001A4D]">
                  Add New Venue
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddVenueModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-gray-700 mb-1">
                  Location Type <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewVenueLocationType('inside')}
                    className={`px-3 py-2 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                      newVenueLocationType === 'inside'
                        ? 'bg-[#001A4D] text-white border-[#001A4D]'
                        : 'bg-gray-50 text-gray-700 border-gray-300 hover:bg-gray-100'
                    }`}
                  >
                    Inside (Campus)
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewVenueLocationType('outside')}
                    className={`px-3 py-2 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                      newVenueLocationType === 'outside'
                        ? 'bg-[#001A4D] text-white border-[#001A4D]'
                        : 'bg-gray-50 text-gray-700 border-gray-300 hover:bg-gray-100'
                    }`}
                  >
                    Outside (Off-Campus)
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">
                  Venue Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newVenueName}
                  onChange={(e) => setNewVenueName(e.target.value)}
                  placeholder={newVenueLocationType === 'inside' ? "e.g. Computer Lab 4 (3rd Floor)" : "e.g. Ormoc Superdome"}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-[#001A4D]/20 outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setShowAddVenueModal(false)}
                className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateVenue}
                disabled={isSavingVenue || !newVenueName.trim()}
                className="px-4 py-1.5 bg-[#001A4D] hover:bg-[#002D72] text-white text-xs font-bold rounded-lg shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
              >
                {isSavingVenue ? 'Saving...' : 'Add New Venue'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
