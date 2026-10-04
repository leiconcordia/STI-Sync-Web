/**
 * src/app/modules/events/components/ActivityOperationalUtilsModal.tsx
 *
 * Official Operational Control Studio for Approved Activities.
 * Unlocks upon executive approval to configure:
 * 1. Attendance & QR Tickets (Gate Passes, Grace Period, Late Threshold & Session Scanning Windows)
 * 2. Promotional Banner & Student Feed Publishing (Mobile Feed Toggle, Schedule, Banner Upload)
 * 3. Event Staff & Attendance Scanners (PIN Code, Assigned Scanners)
 * 4. Target Audience & Academic Filters (SHS/College, Courses, Year Levels, Campus Calendar)
 * 5. Budget Custodians & Liquidation Bridge ("Hold Money" - Dynamic person cash allocations)
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Sparkles,
  DollarSign,
  Users,
  Image as ImageIcon,
  Eye,
  QrCode,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Upload,
  Save,
  HelpCircle,
  FileText,
  UserCheck,
  Calendar,
  Clock,
  Shield,
  Layers,
  Check,
  RotateCcw,
  BookOpen,
} from 'lucide-react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import { ACTIVITIES_COLLECTION } from '../services/event.service';
import type { EventDocument, BudgetCustodianAllocation, EventSession } from '../types/event.types';
import { uploadToCloudinary } from '../../../../services/cloudinary';
import { formatPHP } from '../../activity-proposals/utils/proposal-calculations';
import { useCourses, useDepartments } from '../../academic/hooks/useAcademicStream';
import { toast } from 'sonner';

interface ActivityOperationalUtilsModalProps {
  isOpen: boolean;
  onClose: () => void;
  activity: EventDocument;
  onUpdated?: () => void;
}

type ActiveTab = 'attendance' | 'banner_feed' | 'scanners' | 'audience' | 'custodians';

const YEAR_LEVELS = ['Grade 11', 'Grade 12', '1st Year', '2nd Year', '3rd Year', '4th Year'];

export default function ActivityOperationalUtilsModal({
  isOpen,
  onClose,
  activity,
  onUpdated,
}: ActivityOperationalUtilsModalProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('attendance');
  const [isSaving, setIsSaving] = useState(false);

  const { data: courses = [] } = useCourses();
  const { data: departments = [] } = useDepartments();

  // 1. Attendance & QR Ticket state
  const [enableQRTickets, setEnableQRTickets] = useState<boolean>(
    activity.enableQRTickets !== false && (activity as any).enableQR !== false
  );
  const [attendanceEnabled, setAttendanceEnabled] = useState<boolean>(
    activity.attendanceEnabled !== false
  );
  const [gracePeriodMinutes, setGracePeriodMinutes] = useState<number>(
    activity.gracePeriodMinutes ?? 15
  );
  const [lateThresholdMinutes, setLateThresholdMinutes] = useState<number>(
    activity.lateThresholdMinutes ?? 30
  );
  const [sessions, setSessions] = useState<EventSession[]>([]);

  // 2. Banner & Mobile Feed state
  const [bannerUrl, setBannerUrl] = useState<string>(activity.bannerImageUrl || '');
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);
  const [visibleToStudents, setVisibleToStudents] = useState<boolean>(
    activity.visibleToStudents ?? activity.isVisible ?? true
  );
  const [visibilityDate, setVisibilityDate] = useState<string>(
    typeof activity.visibilityStart === 'string' ? activity.visibilityStart : ''
  );
  const [calendarSync, setCalendarSync] = useState<boolean>(
    (activity as any).calendarSync !== false
  );

  // 3. Staff & Scanners state
  const [scannerPinCode, setScannerPinCode] = useState<string>(
    activity.scannerActivationCode || (activity as any).scannerPinCode || '123456'
  );
  const [scannerUserIds, setScannerUserIds] = useState<string[]>(
    activity.scannerUserIds || []
  );
  const [scannerStaffInput, setScannerStaffInput] = useState<string>('');
  const [assignedScannerStaff, setAssignedScannerStaff] = useState<string[]>(
    (activity as any).scannerStaffNames || []
  );

  // 4. Target Audience & Academic Filters
  const [targetAcademicLevel, setTargetAcademicLevel] = useState<'COLLEGE' | 'SHS' | 'BOTH'>(
    activity.targetAcademicLevel || 'BOTH'
  );
  const [targetCourses, setTargetCourses] = useState<string[]>(
    activity.targetCourses || []
  );
  const [targetYearLevels, setTargetYearLevels] = useState<string[]>(
    activity.targetYearLevels || []
  );

  // 5. Budget Custodians state
  const [custodians, setCustodians] = useState<BudgetCustodianAllocation[]>([]);

  // Initialize data on activity open
  useEffect(() => {
    if (activity) {
      // 1. Attendance & Sessions
      setEnableQRTickets(activity.enableQRTickets !== false && (activity as any).enableQR !== false);
      setAttendanceEnabled(activity.attendanceEnabled !== false);
      setGracePeriodMinutes(activity.gracePeriodMinutes ?? 15);
      setLateThresholdMinutes(activity.lateThresholdMinutes ?? 30);

      if (activity.sessions && activity.sessions.length > 0) {
        setSessions(
          activity.sessions.map((s, idx) => ({
            id: s.id || `sess_${idx + 1}`,
            title: s.title || `Session ${idx + 1}`,
            date: s.date || '',
            startTime: s.startTime || '08:00',
            endTime: s.endTime || '12:00',
            timeInOpen: s.timeInOpen || s.startTime || '07:30',
            timeInClose: s.timeInClose || '09:00',
            hasTimeOut: s.hasTimeOut ?? true,
            timeOutOpen: s.timeOutOpen || s.endTime || '11:30',
            timeOutClose: s.timeOutClose || '13:00',
          }))
        );
      } else {
        setSessions([
          {
            id: 'sess_1',
            title: 'Main Session',
            date: (activity as any).date || '',
            startTime: (activity as any).startTime || '08:00',
            endTime: (activity as any).endTime || '12:00',
            timeInOpen: '07:30',
            timeInClose: '09:00',
            hasTimeOut: true,
            timeOutOpen: '11:30',
            timeOutClose: '13:00',
          },
        ]);
      }

      // 2. Banner & Feed
      setBannerUrl(activity.bannerImageUrl || '');
      setVisibleToStudents(activity.visibleToStudents ?? activity.isVisible ?? true);
      setVisibilityDate(
        typeof activity.visibilityStart === 'string' ? activity.visibilityStart : ''
      );
      setCalendarSync((activity as any).calendarSync !== false);

      // 3. Scanners
      setScannerPinCode(activity.scannerActivationCode || (activity as any).scannerPinCode || '123456');
      setScannerUserIds(activity.scannerUserIds || []);
      setAssignedScannerStaff((activity as any).scannerStaffNames || []);

      // 4. Target Audience
      setTargetAcademicLevel(activity.targetAcademicLevel || 'BOTH');
      setTargetCourses(activity.targetCourses || []);
      setTargetYearLevels(activity.targetYearLevels || []);

      // 5. Custodians
      if (activity.budgetCustodians && activity.budgetCustodians.length > 0) {
        setCustodians(activity.budgetCustodians);
      } else if (activity.budgetItems && activity.budgetItems.length > 0) {
        const prefill = activity.budgetItems.map((item, idx) => ({
          id: `cust_${Date.now()}_${idx}`,
          expenseItemId: item.id,
          personName: '',
          personRole: 'Committee Lead',
          purpose: item.item || item.description || 'Approved Expense',
          allocatedAmount: Number(item.approvedAmount || item.unitCost || 0),
          notes: item.description || '',
        }));
        setCustodians(prefill);
      } else {
        setCustodians([]);
      }
    }
  }, [activity]);

  if (!isOpen) return null;

  const totalApprovedBudget = Number(activity.totalApprovedBudget || 0);

  // Calculations for budget
  const totalAllocated = custodians.reduce(
    (sum, c) => sum + (Number(c.allocatedAmount) || 0),
    0
  );
  const remainingBudget = totalApprovedBudget - totalAllocated;
  const isOverBudget = remainingBudget < -0.01;
  const isFullyAllocated = Math.abs(remainingBudget) < 0.01;

  // Handlers for Custodians
  const handleAddCustodian = () => {
    const newRow: BudgetCustodianAllocation = {
      id: `cust_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      personName: '',
      personRole: '',
      purpose: '',
      allocatedAmount: remainingBudget > 0 ? remainingBudget : 0,
      notes: '',
    };
    setCustodians([...custodians, newRow]);
  };

  const handleUpdateCustodian = (id: string, updates: Partial<BudgetCustodianAllocation>) => {
    setCustodians((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...updates } : c))
    );
  };

  const handleDeleteCustodian = (id: string) => {
    setCustodians((prev) => prev.filter((c) => c.id !== id));
  };

  const handlePrefillFromProjections = () => {
    if (activity.budgetItems && activity.budgetItems.length > 0) {
      const prefill = activity.budgetItems.map((item, idx) => ({
        id: `cust_${Date.now()}_${idx}`,
        expenseItemId: item.id,
        personName: '',
        personRole: 'Committee Lead',
        purpose: item.item || item.description || 'Approved Expense',
        allocatedAmount: Number(item.approvedAmount || item.unitCost || 0),
        notes: item.description || '',
      }));
      setCustodians(prefill);
      toast.success(`Loaded ${prefill.length} items from approved financial projections.`);
    } else {
      toast.info('No itemized budget items found to pre-fill.');
    }
  };

  // Handlers for Banner
  const handleBannerFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingBanner(true);
    try {
      const result = await uploadToCloudinary(file, { folder: 'activities/banners' });
      setBannerUrl(result.secureUrl);
      toast.success('Activity banner uploaded successfully!');
    } catch (err: any) {
      console.error('Banner upload error:', err);
      toast.error('Failed to upload banner: ' + (err?.message || 'Try again'));
    } finally {
      setIsUploadingBanner(false);
    }
  };

  // Handlers for Scanners PIN & Staff
  const handleRegeneratePin = () => {
    const randomPin = Math.floor(100000 + Math.random() * 900000).toString();
    setScannerPinCode(randomPin);
    toast.success(`New Scanner Activation PIN generated: ${randomPin}`);
  };

  const handleAddScannerStaff = () => {
    const trimmed = scannerStaffInput.trim();
    if (!trimmed || assignedScannerStaff.includes(trimmed)) return;
    setAssignedScannerStaff([...assignedScannerStaff, trimmed]);
    setScannerStaffInput('');
  };

  const handleRemoveScannerStaff = (nameToRemove: string) => {
    setAssignedScannerStaff(assignedScannerStaff.filter((n) => n !== nameToRemove));
  };

  // Handlers for Sessions scanning windows
  const handleUpdateSession = (id: string, updates: Partial<EventSession>) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...updates } : s))
    );
  };

  // Handlers for Target Audience
  const handleToggleCourse = (courseCode: string) => {
    setTargetCourses((prev) =>
      prev.includes(courseCode)
        ? prev.filter((c) => c !== courseCode)
        : [...prev, courseCode]
    );
  };

  const handleToggleYearLevel = (year: string) => {
    setTargetYearLevels((prev) =>
      prev.includes(year)
        ? prev.filter((y) => y !== year)
        : [...prev, year]
    );
  };

  // Save all settings
  const handleSaveAll = async () => {
    if (isOverBudget) {
      toast.error(
        `Cannot save: Total allocated (${formatPHP(totalAllocated)}) exceeds the approved budget (${formatPHP(totalApprovedBudget)}) by ${formatPHP(Math.abs(remainingBudget))}.`
      );
      return;
    }

    setIsSaving(true);
    try {
      const cleanCustodians = custodians.map((c) => ({
        ...c,
        personName: (c.personName || '').trim(),
        purpose: (c.purpose || '').trim(),
        allocatedAmount: Number(c.allocatedAmount) || 0,
      }));

      const docRef = doc(db, ACTIVITIES_COLLECTION, activity.id);
      await updateDoc(docRef, {
        // Attendance & QR Tickets
        enableQRTickets,
        attendanceEnabled: enableQRTickets,
        gracePeriodMinutes: Number(gracePeriodMinutes) || 15,
        lateThresholdMinutes: Number(lateThresholdMinutes) || 30,
        sessions,

        // Promotional Banner & Mobile Feed
        bannerImageUrl: bannerUrl || null,
        visibleToStudents,
        isVisible: visibleToStudents,
        visibilityStart: visibilityDate || null,
        calendarSync,

        // Staff & Scanners
        scannerActivationCode: scannerPinCode,
        scannerPinCode,
        scannerUserIds,
        scannerStaffNames: assignedScannerStaff,

        // Target Audience & Academic Filters
        targetAcademicLevel,
        targetCourses,
        targetYearLevels,

        // Budget Custodians
        budgetCustodians: cleanCustodians,
        totalAllocatedBudget: totalAllocated,

        updatedAt: serverTimestamp(),
      });

      toast.success('Activity operational configurations updated successfully!');
      if (onUpdated) onUpdated();
      onClose();
    } catch (err: any) {
      console.error('Failed to save operational settings:', err);
      toast.error(err?.message || 'Failed to save settings.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/75 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-5xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* ── MODAL HEADER ── */}
        <div className="bg-[#001A4D] text-white px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#0E4EBD] text-white flex items-center justify-center shadow-md">
              <Sparkles className="w-5 h-5 text-[#FFD41C]" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-white leading-tight">
                  Activity Operational Control Studio
                </h2>
                <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-[#FFD41C] border border-blue-400/30">
                  {activity.referenceId}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  Approved & Unlocked
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                {activity.title} • Approved Budget Ceiling: <strong>{formatPHP(totalApprovedBudget)}</strong>
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

        {/* ── 5-TAB NAVIGATION BAR ── */}
        <div className="bg-slate-100 border-b border-slate-200 px-6 flex items-center gap-1 overflow-x-auto flex-shrink-0">
          {/* Tab 1: Attendance & Sessions */}
          <button
            type="button"
            onClick={() => setActiveTab('attendance')}
            className={`py-3 px-3.5 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'attendance'
                ? 'border-[#001A4D] text-[#001A4D] bg-white rounded-t-xl shadow-2xs'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Clock className="w-4 h-4 text-amber-600" />
            <span>Attendance & Sessions</span>
            {enableQRTickets && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-100 text-emerald-800 font-bold">
                QR ON
              </span>
            )}
          </button>

          {/* Tab 2: Banner & Mobile Feed */}
          <button
            type="button"
            onClick={() => setActiveTab('banner_feed')}
            className={`py-3 px-3.5 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'banner_feed'
                ? 'border-[#001A4D] text-[#001A4D] bg-white rounded-t-xl shadow-2xs'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <ImageIcon className="w-4 h-4 text-blue-600" />
            <span>Banner & Student Feed</span>
            {visibleToStudents && <span className="w-2 h-2 rounded-full bg-emerald-500" />}
          </button>

          {/* Tab 3: Staff & Scanners */}
          <button
            type="button"
            onClick={() => setActiveTab('scanners')}
            className={`py-3 px-3.5 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'scanners'
                ? 'border-[#001A4D] text-[#001A4D] bg-white rounded-t-xl shadow-2xs'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <QrCode className="w-4 h-4 text-purple-600" />
            <span>Staff & Scanners</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-200 text-slate-700 font-mono font-bold">
              {assignedScannerStaff.length}
            </span>
          </button>

          {/* Tab 4: Target Audience & Calendar */}
          <button
            type="button"
            onClick={() => setActiveTab('audience')}
            className={`py-3 px-3.5 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'audience'
                ? 'border-[#001A4D] text-[#001A4D] bg-white rounded-t-xl shadow-2xs'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <BookOpen className="w-4 h-4 text-indigo-600" />
            <span>Audience & Calendar</span>
          </button>

          {/* Tab 5: Budget Custodians */}
          <button
            type="button"
            onClick={() => setActiveTab('custodians')}
            className={`py-3 px-3.5 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'custodians'
                ? 'border-[#001A4D] text-[#001A4D] bg-white rounded-t-xl shadow-2xs'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <DollarSign className="w-4 h-4 text-emerald-600" />
            <span>Budget Custodians ("Hold Money")</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-100 text-emerald-800 font-mono font-bold">
              {custodians.length}
            </span>
          </button>
        </div>

        {/* ── MODAL BODY CONTENT ── */}
        <div className="flex-1 p-6 overflow-y-auto bg-slate-50/50">
          {/* ════ TAB 1: ATTENDANCE & SESSIONS ════ */}
          {activeTab === 'attendance' && (
            <div className="space-y-6 max-w-3xl mx-auto">
              {/* Master Toggles */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">Enable QR Gate Passes</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Generate personal QR codes on student mobile tickets for scanning upon entry and exit.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enableQRTickets}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setEnableQRTickets(checked);
                        setAttendanceEnabled(checked);
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#001A4D]"></div>
                  </label>
                </div>


              </div>

              {/* Attendance Rules (Grace Period & Late Threshold) */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Attendance Rules & Scanning Thresholds
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Grace Period (Minutes after session start)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min={0}
                        value={gracePeriodMinutes}
                        onChange={(e) => setGracePeriodMinutes(parseInt(e.target.value) || 0)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                      <span className="absolute right-3 top-2 text-xs text-slate-400 font-medium">mins</span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">Students scanning within this window are marked "Present".</p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Late Entry Cutoff Threshold
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min={0}
                        value={lateThresholdMinutes}
                        onChange={(e) => setLateThresholdMinutes(parseInt(e.target.value) || 0)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                      <span className="absolute right-3 top-2 text-xs text-slate-400 font-medium">mins</span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">After this duration, scans are locked or flagged as "Late / Absent".</p>
                  </div>
                </div>
              </div>

              {/* Per-Session Scanning Windows */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Program Sessions & Check-In Windows ({sessions.length})
                  </h4>
                </div>

                <div className="space-y-3">
                  {sessions.map((sess, idx) => (
                    <div key={sess.id || idx} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-[#001A4D]">
                          Session {idx + 1}: {sess.title}
                        </span>
                        <span className="text-[11px] text-slate-500 font-mono">
                          {sess.date || 'TBD'} • {sess.startTime} - {sess.endTime}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                            Time-In Open
                          </label>
                          <input
                            type="time"
                            value={sess.timeInOpen || ''}
                            onChange={(e) => handleUpdateSession(sess.id, { timeInOpen: e.target.value })}
                            className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold outline-none"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                            Time-In Close
                          </label>
                          <input
                            type="time"
                            value={sess.timeInClose || ''}
                            onChange={(e) => handleUpdateSession(sess.id, { timeInClose: e.target.value })}
                            className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold outline-none"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                            Time-Out Open
                          </label>
                          <input
                            type="time"
                            value={sess.timeOutOpen || ''}
                            onChange={(e) => handleUpdateSession(sess.id, { timeOutOpen: e.target.value })}
                            className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold outline-none"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                            Time-Out Close
                          </label>
                          <input
                            type="time"
                            value={sess.timeOutClose || ''}
                            onChange={(e) => handleUpdateSession(sess.id, { timeOutClose: e.target.value })}
                            className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ════ TAB 2: PROMOTIONAL BANNER & STUDENT FEED ════ */}
          {activeTab === 'banner_feed' && (
            <div className="space-y-6 max-w-2xl mx-auto">
              {/* Student Feed Publishing */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">Show Activity in Student Feed</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Controls if this activity appears in the STI Sync mobile app and student event discovery.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visibleToStudents}
                      onChange={(e) => setVisibleToStudents(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-slate-500" />
                      <span>Scheduled Publish Date & Time</span>
                    </label>
                    <input
                      type="datetime-local"
                      value={visibilityDate}
                      onChange={(e) => setVisibilityDate(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">Leave empty to publish immediately.</p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-slate-500" />
                      <span>Campus Academic Calendar Sync</span>
                    </label>
                    <div className="flex items-center gap-2 mt-2.5">
                      <input
                        type="checkbox"
                        id="calSync"
                        checked={calendarSync}
                        onChange={(e) => setCalendarSync(e.target.checked)}
                        className="w-4 h-4 rounded text-blue-600 accent-[#001A4D] cursor-pointer"
                      />
                      <label htmlFor="calSync" className="text-xs text-slate-700 font-medium cursor-pointer">
                        Feature on STI Campus Events Calendar
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              {/* Promotional Banner Upload */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <div className="text-center space-y-1">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Official Promotional Activity Banner Image
                  </h4>
                  <p className="text-xs text-slate-500">
                    High-resolution promotional banner shown on the mobile app header and web activity card.
                  </p>
                </div>

                {bannerUrl ? (
                  <div className="space-y-3">
                    <div className="relative rounded-2xl overflow-hidden border border-slate-200 shadow-md aspect-video bg-slate-950 flex items-center justify-center">
                      <img
                        src={bannerUrl}
                        alt="Activity Banner"
                        className="w-full h-full object-cover"
                      />
                    </div>
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
                  </div>
                ) : (
                  <label className="border-2 border-dashed border-slate-300 hover:border-blue-400 bg-slate-50 hover:bg-blue-50/20 rounded-3xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-colors block">
                    <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-3">
                      <Upload className="w-6 h-6" />
                    </div>
                    <p className="text-xs font-bold text-slate-800">
                      {isUploadingBanner ? 'Uploading to secure storage...' : 'Click to upload or drag & drop activity promotional banner'}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">
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
            </div>
          )}

          {/* ════ TAB 3: STAFF & SCANNERS ════ */}
          {activeTab === 'scanners' && (
            <div className="space-y-6 max-w-2xl mx-auto">
              {/* Dynamic Scanner PIN Code */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <QrCode className="w-5 h-5 text-purple-600" />
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">Mobile Scanner Activation PIN</h4>
                      <p className="text-[11px] text-slate-500">
                        Volunteers and student staff enter this PIN in the STI Scanner app to authorize scanning.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleRegeneratePin}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                    <span>Regenerate</span>
                  </button>
                </div>

                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                  <span className="text-xs text-slate-600 font-medium">Active PIN Code:</span>
                  <span className="font-mono font-black text-xl tracking-widest text-[#001A4D] bg-white px-4 py-1.5 rounded-lg border border-slate-300 shadow-xs">
                    {scannerPinCode}
                  </span>
                </div>
              </div>

              {/* Assigned Scanner Officers & Staff */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Designated Scanner Officers & Staff ({assignedScannerStaff.length})
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Authorized student officers and logistics volunteers who will scan QR tickets at the venue entrance.
                  </p>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={scannerStaffInput}
                    onChange={(e) => setScannerStaffInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddScannerStaff();
                      }
                    }}
                    placeholder="Enter officer / volunteer full name..."
                    className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-purple-500/20"
                  />
                  <button
                    type="button"
                    onClick={handleAddScannerStaff}
                    className="px-4 py-2 bg-[#001A4D] text-[#FFD41C] text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Assign</span>
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                  {assignedScannerStaff.map((name, i) => (
                    <span
                      key={i}
                      className="px-3 py-1.5 bg-purple-50 text-purple-900 border border-purple-200 rounded-xl text-xs font-semibold flex items-center gap-2"
                    >
                      <UserCheck className="w-3.5 h-3.5 text-purple-600" />
                      <span>{name}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveScannerStaff(name)}
                        className="text-purple-400 hover:text-rose-600 transition-colors cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  ))}
                  {assignedScannerStaff.length === 0 && (
                    <p className="text-xs text-slate-400 italic">
                      No specific officers designated yet. Anyone with the PIN code can activate scanner mode.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ════ TAB 4: TARGET AUDIENCE & ACADEMIC FILTERS ════ */}
          {activeTab === 'audience' && (
            <div className="space-y-6 max-w-2xl mx-auto">
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Target Academic Level
                </h4>
                <div className="grid grid-cols-3 gap-3">
                  {(['COLLEGE', 'SHS', 'BOTH'] as const).map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setTargetAcademicLevel(lvl)}
                      className={`p-3 rounded-xl border text-xs font-bold transition-all cursor-pointer text-center ${
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

              {/* Course Filters */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Eligible Academic Programs / Courses
                  </h4>
                  <span className="text-[11px] text-slate-500">
                    {targetCourses.length === 0 ? 'All courses eligible' : `${targetCourses.length} selected`}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {['BSIT', 'BSCS', 'BSHM', 'BSTM', 'BSBA', 'BSA', 'STEM', 'ABM', 'HUMSS', 'ICT'].map((code) => {
                    const isSelected = targetCourses.includes(code);
                    return (
                      <button
                        key={code}
                        type="button"
                        onClick={() => handleToggleCourse(code)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
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

              {/* Year Level Filters */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Target Year Levels
                  </h4>
                  <span className="text-[11px] text-slate-500">
                    {targetYearLevels.length === 0 ? 'All year levels' : `${targetYearLevels.length} selected`}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {YEAR_LEVELS.map((year) => {
                    const isSelected = targetYearLevels.includes(year);
                    return (
                      <label
                        key={year}
                        className={`p-2.5 rounded-xl border flex items-center gap-2 cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-blue-50 border-blue-200 text-[#001A4D] font-bold'
                            : 'bg-slate-50 border-slate-200 text-slate-700'
                        }`}
                      >
                        <input
                          type="checkbox"
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
          )}

          {/* ════ TAB 5: BUDGET CUSTODIANS ("HOLD MONEY") ════ */}
          {activeTab === 'custodians' && (
            <div className="space-y-5">
              {/* Top KPI Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Total Approved Budget
                  </span>
                  <div className="text-xl font-black text-slate-900 mt-1">
                    {formatPHP(totalApprovedBudget)}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-0.5">Officially endorsed ceiling</p>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Total Disbursed / Allocated
                  </span>
                  <div
                    className={`text-xl font-black mt-1 ${
                      isOverBudget
                        ? 'text-rose-600'
                        : isFullyAllocated
                        ? 'text-emerald-600'
                        : 'text-blue-600'
                    }`}
                  >
                    {formatPHP(totalAllocated)}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-0.5">Entrusted to designated committee leads</p>
                </div>

                <div
                  className={`p-4 rounded-2xl border shadow-xs ${
                    isOverBudget
                      ? 'bg-rose-50 border-rose-200 text-rose-900'
                      : isFullyAllocated
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-blue-50 border-blue-200 text-blue-900'
                  }`}
                >
                  <span className="text-[11px] font-bold uppercase tracking-wider">
                    {isOverBudget ? 'Budget Deficit / Over' : 'Remaining to Disburse'}
                  </span>
                  <div className="text-xl font-black mt-1">
                    {formatPHP(Math.abs(remainingBudget))}
                  </div>
                  <p className="text-[10px] mt-0.5 opacity-80">
                    {isOverBudget
                      ? 'Exceeds approved budget!'
                      : isFullyAllocated
                      ? '100% Subdivided perfectly'
                      : 'Available for remaining committee items'}
                  </p>
                </div>
              </div>

              {/* Explanatory Banner */}
              <div className="p-3.5 bg-blue-50/80 border border-blue-200 rounded-2xl flex items-start gap-2.5 text-xs text-blue-900">
                <HelpCircle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                <p>
                  <strong>How Cash Disbursal Works:</strong> Specify which person/committee holds cash advances for specific expenses. When the event ends, the <strong>Liquidation Table</strong> will automatically populate using these exact persons and allocated amounts so they can attach official receipts.
                </p>
              </div>

              {/* Controls bar */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Designated Cash Custodians & Committee Allocations
                </h3>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handlePrefillFromProjections}
                    className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5 text-blue-600" />
                    <span>Pre-fill from Proposal Items</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleAddCustodian}
                    className="px-3.5 py-1.5 bg-[#001A4D] hover:bg-[#002D72] text-[#FFD41C] text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Person Allocation</span>
                  </button>
                </div>
              </div>

              {/* Dynamic Custodians Table */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                {custodians.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-xs">
                    <Users className="w-8 h-8 mx-auto mb-2 text-slate-400 opacity-50" />
                    <p className="font-bold text-slate-700">No cash custodians allocated yet.</p>
                    <p className="text-slate-400 text-[11px] mt-1">
                      Click "Add Person Allocation" or "Pre-fill from Proposal Items" to assign money to committee leads.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold uppercase text-[10px] tracking-wider">
                        <tr>
                          <th className="py-3 px-4">Person (Custodian)</th>
                          <th className="py-3 px-3">Role / Committee</th>
                          <th className="py-3 px-3">Purpose / Category</th>
                          <th className="py-3 px-3 w-36">Allocated Cash (₱)</th>
                          <th className="py-3 px-3">Notes / Instructions</th>
                          <th className="py-3 px-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {custodians.map((c, idx) => (
                          <tr key={c.id || idx} className="hover:bg-slate-50/50">
                            {/* Person Name */}
                            <td className="py-2.5 px-4">
                              <input
                                type="text"
                                value={c.personName}
                                onChange={(e) =>
                                  handleUpdateCustodian(c.id, { personName: e.target.value })
                                }
                                placeholder="e.g. Juan Dela Cruz"
                                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:bg-white focus:ring-2 focus:ring-blue-500/20 outline-none"
                              />
                            </td>

                            {/* Role / Committee */}
                            <td className="py-2.5 px-3">
                              <input
                                type="text"
                                value={c.personRole || ''}
                                onChange={(e) =>
                                  handleUpdateCustodian(c.id, { personRole: e.target.value })
                                }
                                placeholder="e.g. Logistics Head"
                                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:bg-white focus:ring-2 focus:ring-blue-500/20 outline-none"
                              />
                            </td>

                            {/* Purpose / Item */}
                            <td className="py-2.5 px-3">
                              <input
                                type="text"
                                value={c.purpose}
                                onChange={(e) =>
                                  handleUpdateCustodian(c.id, { purpose: e.target.value })
                                }
                                placeholder="e.g. Refreshments & Water"
                                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:bg-white focus:ring-2 focus:ring-blue-500/20 outline-none"
                              />
                            </td>

                            {/* Allocated Cash Amount */}
                            <td className="py-2.5 px-3">
                              <div className="relative">
                                <span className="absolute left-2.5 top-1.5 text-slate-400 font-bold">
                                  ₱
                                </span>
                                <input
                                  type="number"
                                  min={0}
                                  step="any"
                                  value={c.allocatedAmount || ''}
                                  onChange={(e) =>
                                    handleUpdateCustodian(c.id, {
                                      allocatedAmount: parseFloat(e.target.value) || 0,
                                    })
                                  }
                                  placeholder="0.00"
                                  className="w-full pl-6 pr-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500/20 outline-none"
                                />
                              </div>
                            </td>

                            {/* Notes */}
                            <td className="py-2.5 px-3">
                              <input
                                type="text"
                                value={c.notes || ''}
                                onChange={(e) =>
                                  handleUpdateCustodian(c.id, { notes: e.target.value })
                                }
                                placeholder="e.g. Keep official receipts"
                                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 outline-none"
                              />
                            </td>

                            {/* Delete */}
                            <td className="py-2.5 px-3 text-right">
                              <button
                                type="button"
                                onClick={() => handleDeleteCustodian(c.id)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                title="Remove row"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── MODAL FOOTER ── */}
        <div className="bg-slate-100 border-t border-slate-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div className="text-xs text-slate-500">
            {activeTab === 'custodians' && (
              <span>
                Total Disbursed: <strong className="text-slate-800">{formatPHP(totalAllocated)}</strong> / {formatPHP(totalApprovedBudget)}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleSaveAll}
              disabled={isSaving || isOverBudget}
              className="px-5 py-2.5 bg-[#001A4D] hover:bg-[#002D72] text-[#FFD41C] text-xs font-bold rounded-xl shadow-xs inline-flex items-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Saving Configurations...' : 'Save Operational Configurations'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
