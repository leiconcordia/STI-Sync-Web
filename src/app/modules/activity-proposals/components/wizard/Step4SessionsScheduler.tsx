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
} from 'lucide-react';
import { toast } from 'sonner';
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

  const [date, setDate] = useState(singleSession.date || '');
  const [startTime, setStartTime] = useState(singleSession.startTime || '');
  const [endTime, setEndTime] = useState(singleSession.endTime || '');
  const [includeTime, setIncludeTime] = useState<boolean>(Boolean(singleSession.startTime && singleSession.endTime));
  const [venueId, setVenueId] = useState(singleSession.venueId || '');
  const [venueName, setVenueName] = useState(singleSession.venueName || '');

  // Add Venue Modal / Dialog state
  const [showAddVenueModal, setShowAddVenueModal] = useState(false);
  const [newVenueName, setNewVenueName] = useState('');
  const [newVenueCapacity, setNewVenueCapacity] = useState(60);
  const [newVenueFacilities, setNewVenueFacilities] = useState<string[]>([
    'Air Conditioning',
    'Sound System',
  ]);
  const [isSavingVenue, setIsSavingVenue] = useState(false);

  // Sync back to formData
  const syncToFormData = (
    updatedDate: string,
    updatedStart: string,
    updatedEnd: string,
    updatedVId: string,
    updatedVName: string
  ) => {
    onChange({
      date: updatedDate,
      startTime: updatedStart,
      endTime: updatedEnd,
      venueId: updatedVId,
      venueName: updatedVName,
      sessions: [],
    });
  };

  const handleDateChange = (val: string) => {
    setDate(val);
    syncToFormData(val, includeTime ? startTime : '', includeTime ? endTime : '', venueId, venueName);
  };

  const handleStartTimeChange = (val: string) => {
    setStartTime(val);
    syncToFormData(date, val, endTime, venueId, venueName);
  };

  const handleEndTimeChange = (val: string) => {
    setEndTime(val);
    syncToFormData(date, startTime, val, venueId, venueName);
  };

  const handleVenueChange = (selectedId: string) => {
    if (selectedId === '__add_new__') {
      setShowAddVenueModal(true);
      return;
    }

    const found = availableVenues.find((v) => v.id === selectedId);
    const vName = found ? found.name : '';
    setVenueId(selectedId);
    setVenueName(vName);
    syncToFormData(date, includeTime ? startTime : '', includeTime ? endTime : '', selectedId, vName);
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
        capacity: Number(newVenueCapacity) || 50,
        facilities: newVenueFacilities,
        isCustom: false,
      });

      toast.success(`Venue "${trimmed}" added and saved to campus database!`);
      setShowAddVenueModal(false);
      setNewVenueName('');

      // Auto-select the newly created venue
      setVenueId(created.id);
      setVenueName(trimmed);
      syncToFormData(date, includeTime ? startTime : '', includeTime ? endTime : '', created.id, trimmed);
    } catch (err: any) {
      console.error('Failed to save venue:', err);
      toast.error(err?.message || 'Failed to save venue to database.');
    } finally {
      setIsSavingVenue(false);
    }
  };

  const toggleFacility = (facility: string) => {
    setNewVenueFacilities((prev) =>
      prev.includes(facility) ? prev.filter((f) => f !== facility) : [...prev, facility]
    );
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
              Activity proposal schedule and campus location (Form AP-01 Section 12).
            </p>
          </div>
        </div>
      </div>

      {/* Informational Guidance Banner */}
      <div className="p-3.5 bg-blue-50/80 border border-blue-200 rounded-2xl flex items-start gap-3">
        <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-blue-950 space-y-1">
          <p className="font-bold">
            Activity Target Schedule & Campus Venue (Reports & Form AP-01)
          </p>
          <p className="text-blue-800 leading-relaxed font-normal">
            This records the target date, operational hours, and designated campus venue for official proposal vetting and administrative reports. Attendance sessions and scanners are configured separately after approval under Attendance & Scanners.
          </p>
        </div>
      </div>

      {/* Validation Error banner if any */}
      {errors.sessions && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{errors.sessions}</span>
        </div>
      )}

      {/* Schedule & Venue Card */}
      <div className="border border-gray-200 rounded-2xl p-6 bg-white shadow-xs space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
          {/* Target Implementation Date */}
          <div className="md:col-span-12">
            <label className="block text-xs font-semibold text-gray-700 mb-1.5 flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-blue-600" />
              <span>Target Implementation Date <span className="text-red-500">*</span></span>
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => handleDateChange(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-gray-50/50 border border-gray-300 rounded-xl text-xs focus:ring-2 focus:ring-[#001A4D]/20 focus:border-[#001A4D] text-gray-900 font-semibold"
            />
            <p className="text-[11px] text-gray-500 mt-1">
              The proposed calendar date the activity is scheduled to take place, recorded for institutional activity reporting.
            </p>
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

          {/* Venue (Loaded exclusively from Database) */}
          <div className="md:col-span-12">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-blue-600" />
                <span>Campus Venue (from Database) <span className="text-red-500">*</span></span>
              </label>

            
            </div>

            <select
              value={venueId}
              onChange={(e) => handleVenueChange(e.target.value)}
              disabled={venuesLoading}
              className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-xl text-xs font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#001A4D]/20 focus:border-[#001A4D]"
            >
              <option value="">
                {venuesLoading ? 'Loading venues from database...' : 'Select venue from database...'}
              </option>
              {availableVenues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} {v.capacity ? `(Capacity: ${v.capacity})` : ''}
                </option>
              ))}
              <option value="__add_new__">+ Add New Venue...</option>
            </select>

            {venueName && (
              <div className="mt-2 p-2.5 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-[#0E4EBD]" />
                  <span>Selected Venue: <strong>{venueName}</strong></span>
                </div>
                <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-semibold uppercase">
                  Database Verified
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── ADD NEW VENUE MODAL (Saves to Firestore collection 'venues') ── */}
      {showAddVenueModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-200 p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Building className="w-5 h-5 text-[#001A4D]" />
                <h3 className="font-bold text-sm text-[#001A4D]">
                  Add New Campus Venue to Database
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddVenueModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-gray-700 mb-1">
                  Venue Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newVenueName}
                  onChange={(e) => setNewVenueName(e.target.value)}
                  placeholder="e.g. Computer Lab 4 (3rd Floor)"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-[#001A4D]/20 outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">
                  Seating / Room Capacity
                </label>
                <input
                  type="number"
                  min="5"
                  value={newVenueCapacity}
                  onChange={(e) => setNewVenueCapacity(Number(e.target.value))}
                  placeholder="e.g. 50"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-[#001A4D]/20 outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1.5">
                  Available Facilities / Equipment
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {COMMON_FACILITIES.map((facility) => {
                    const isChecked = newVenueFacilities.includes(facility);
                    return (
                      <button
                        key={facility}
                        type="button"
                        onClick={() => toggleFacility(facility)}
                        className={`text-[11px] px-2.5 py-1 rounded-md border transition-all cursor-pointer ${
                          isChecked
                            ? 'bg-blue-50 text-[#001A4D] border-blue-300 font-bold'
                            : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                        }`}
                      >
                        {isChecked ? '✓ ' : '+ '}
                        {facility}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setShowAddVenueModal(false)}
                className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateVenue}
                disabled={isSavingVenue || !newVenueName.trim()}
                className="px-4 py-1.5 bg-[#001A4D] hover:bg-[#002D72] text-white text-xs font-bold rounded-lg shadow-xs transition-colors disabled:opacity-50"
              >
                {isSavingVenue ? 'Saving to Database...' : 'Save Venue to Database'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
