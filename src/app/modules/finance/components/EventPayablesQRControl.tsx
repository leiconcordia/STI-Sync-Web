import { useState, useMemo, useEffect, useRef } from 'react';
import {
  Search,
  Lock,
  Unlock,
  Loader2,
  Coins,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  XCircle,
  RotateCcw,
  Clock,
  Download,
  Upload,
  FileSpreadsheet,
  X,
} from 'lucide-react';
import { doc, getDoc, writeBatch } from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import { useEventPayablesStream } from '../hooks/usePayableStream';
import {
  toggleQRTicketUnlock,
  applyCashierContributionPayments,
  type CashierUploadReceiptProof,
} from '../services/payable.service';
import type { PayableDocument } from '../types/payable.types';
import { AdminRecordPaymentModal } from './AdminRecordPaymentModal';
import { useStudents } from '../../students/hooks/useStudentStream';
import { generatePayablesForEvent } from '../../events/services/event.service';
import { formatCurrency } from '../../../utils/currency';
import { uploadToCloudinary } from '../../../../services/cloudinary';
import {
  exportEventContributionRosterExcel,
  parseCashierContributionFile,
  type ParsedCashierContributionResult,
} from '../utils/student-contribution-excel';
import { toast } from 'sonner';

interface EventPayablesQRControlProps {
  eventId: string;
  eventTitle: string;
  referenceId?: string;
  adminFeeAmount?: number | null;
  recordedByUid: string;
  recordedByName?: string;
  isOfficer?: boolean;
  isClubEvent?: boolean;
  hostingOrgName?: string;
  readOnly?: boolean;
  isCancelled?: boolean;
  isQREnabled?: boolean;
  semesterId?: string | null;
  schoolYear?: string;
  semester?: string;
  appliedRetainedAmount?: number;
}

export function EventPayablesQRControl({
  eventId,
  eventTitle,
  referenceId,
  adminFeeAmount,
  recordedByUid,
  recordedByName = 'SAS Admin',
  isOfficer = false,
  isClubEvent = false,
  hostingOrgName,
  readOnly = false,
  isCancelled = false,
  isQREnabled = true,
  semesterId,
  schoolYear,
  semester,
  appliedRetainedAmount = 0,
}: EventPayablesQRControlProps) {
  const { data: payables, loading } = useEventPayablesStream(eventId);
  const { data: students } = useStudents();

  // Admin cannot accept payment or unlock QR tickets for club events, and cancelled events forbid payment
  const canManagePayments = !readOnly && !isCancelled && (isOfficer ? true : !isClubEvent);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unpaid' | 'paid' | 'locked' | 'unlocked'>('all');
  const [selectedPayable, setSelectedPayable] = useState<PayableDocument | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Map student records by id, authUid, and studentId
  const studentsMap = useMemo(() => {
    const map: Record<string, any> = {};
    (students || []).forEach((s) => {
      if (s.id) map[s.id] = s;
      if (s.authUid) map[s.authUid] = s;
      if (s.studentId) map[s.studentId] = s;
    });
    return map;
  }, [students]);

  const getStudentDisplayName = (p: PayableDocument) => {
    const matched =
      studentsMap[p.studentId] ||
      (p.studentSchoolId ? studentsMap[p.studentSchoolId] : undefined) ||
      ((p as any).authUid ? studentsMap[(p as any).authUid] : undefined);

    if (matched) {
      const full = `${matched.firstName || ''} ${matched.lastName || ''}`.trim();
      if (full) return full;
    }

    if (p.studentName && p.studentName.trim() && p.studentName !== 'Student') return p.studentName;
    const raw = p as any;
    if (raw.name && String(raw.name).trim()) return raw.name;
    if (raw.student_name && String(raw.student_name).trim()) return raw.student_name;
    if (raw.fullName && String(raw.fullName).trim()) return raw.fullName;
    return p.studentName || 'Student';
  };

  const getStudentDisplayId = (p: PayableDocument) => {
    const matched =
      studentsMap[p.studentId] ||
      (p.studentSchoolId ? studentsMap[p.studentSchoolId] : undefined) ||
      ((p as any).authUid ? studentsMap[(p as any).authUid] : undefined);

    // Official 11-digit STI Student ID
    if (matched && matched.studentId && matched.studentId.trim()) {
      return matched.studentId;
    }

    if (p.studentSchoolId && p.studentSchoolId.trim()) return p.studentSchoolId;
    const raw = p as any;
    if (raw.schoolId && String(raw.schoolId).trim()) return raw.schoolId;
    if (raw.studentNumber && String(raw.studentNumber).trim()) return raw.studentNumber;
    if (raw.stiId && String(raw.stiId).trim()) return raw.stiId;
    if (p.studentId && p.studentId.trim() && !p.studentId.includes('-') && p.studentId.length >= 8) {
      return p.studentId;
    }
    return 'N/A';
  };

  const filteredPayables = useMemo(() => {
    return payables.filter((p) => {
      const q = searchQuery.toLowerCase().trim();
      const sName = getStudentDisplayName(p).toLowerCase();
      const sId = getStudentDisplayId(p).toLowerCase();

      const matchesSearch = !q || sName.includes(q) || sId.includes(q);

      if (!matchesSearch) return false;

      if (statusFilter === 'unpaid') return p.status !== 'paid' && p.status !== 'waived';
      if (statusFilter === 'paid') return p.status === 'paid' || p.status === 'waived';
      if (statusFilter === 'locked') return !p.qrTicketUnlocked;
      if (statusFilter === 'unlocked') return !!p.qrTicketUnlocked;

      return true;
    });
  }, [payables, searchQuery, statusFilter]);

  const totalAssigned = useMemo(() => payables.reduce((a, p) => a + (p.assignedAmount || 0), 0), [payables]);
  const totalCollected = useMemo(() => payables.reduce((a, p) => a + (p.paidAmount || 0), 0), [payables]);
  const paidCount = useMemo(() => payables.filter((p) => p.status === 'paid').length, [payables]);
  const unpaidCount = useMemo(
    () => payables.filter((p) => p.status !== 'paid' && p.status !== 'waived' && p.status !== 'refunded').length,
    [payables]
  );
  const unlockedCount = useMemo(
    () => (isCancelled ? 0 : payables.filter((p) => p.qrTicketUnlocked).length),
    [payables, isCancelled]
  );
  const lockedCount = useMemo(() => payables.length - unlockedCount, [payables, unlockedCount]);

  const [isSyncing, setIsSyncing] = useState(false);
  const autoSyncedEventRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const receiptInputRef = useRef<HTMLInputElement>(null);
  const [cashierPreview, setCashierPreview] = useState<ParsedCashierContributionResult | null>(null);
  const [cashierFileName, setCashierFileName] = useState<string>('');
  const [batchReferenceNo, setBatchReferenceNo] = useState<string>('');
  const [batchReceiptProof, setBatchReceiptProof] = useState<CashierUploadReceiptProof | null>(null);
  const [isUploadingReceipt, setIsUploadingReceipt] = useState(false);
  const [isApplyingCashier, setIsApplyingCashier] = useState(false);

  const canUseCashierFile = canManagePayments && !isOfficer && !isClubEvent;
  const spendableCashOnHand = Math.round((totalCollected + Math.max(0, appliedRetainedAmount)) * 100) / 100;
  const uncollectedReceivables = Math.max(0, Math.round((totalAssigned - totalCollected) * 100) / 100);

  const handleBatchReceiptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setIsUploadingReceipt(true);
    try {
      const res = await uploadToCloudinary(file, { folder: 'cashier-contribution-receipts' });
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      setBatchReceiptProof({
        url: res.secureUrl,
        fileName: file.name,
        fileType: ext === 'pdf' ? 'pdf' : 'image',
      });
      toast.success('Cashier receipt proof attached.');
    } catch (err: any) {
      console.error('[handleBatchReceiptUpload] Upload failed:', err);
      toast.error(err?.message || 'Failed to upload receipt proof.');
    } finally {
      setIsUploadingReceipt(false);
    }
  };

  const handleExportRoster = () => {
    if (payables.length === 0) {
      toast.info('No student payables generated yet. Click "Sync Roster Data" first.');
      return;
    }
    exportEventContributionRosterExcel({
      eventTitle,
      referenceId,
      contributionRate: Number(adminFeeAmount || 0),
      payables,
      resolveStudentName: getStudentDisplayName,
      resolveStudentId: getStudentDisplayId,
    });
    toast.success(`Exported ${payables.length} student record(s) to Excel.`);
  };

  const handleCashierFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (payables.length === 0) {
      toast.error('Please click "Sync Roster Data" first so target student payables exist before uploading Cashier payments.');
      return;
    }
    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseCashierContributionFile(
        buffer,
        payables,
        getStudentDisplayName,
        getStudentDisplayId,
        {
          expectedActivityTitle: eventTitle,
          expectedReferenceId: referenceId,
        }
      );
      setCashierFileName(file.name);
      setBatchReferenceNo('');
      setBatchReceiptProof(null);
      setCashierPreview(parsed);
    } catch (err: any) {
      console.error('[handleCashierFileSelected] Parse error:', err);
      toast.error(err?.message || 'Failed to read Cashier file.');
    }
  };

  const handleConfirmCashierImport = async () => {
    if (!cashierPreview || cashierPreview.matchedToMarkPaid.length === 0 || isApplyingCashier) return;
    setIsApplyingCashier(true);
    try {
      const res = await applyCashierContributionPayments({
        eventId,
        eventTitle,
        semesterId,
        schoolYear,
        semester,
        items: cashierPreview.matchedToMarkPaid.map((m) => ({
          payableId: m.payable.id,
          paidAmount: m.paidAmount,
          orNumber: m.orNumber,
          paidDate: m.paidDate,
        })),
        recordedByUid,
        recordedByName,
        batchReferenceNo,
        receiptProof: batchReceiptProof,
      });
      toast.success(
        res.routedToRetainedFund
          ? `Updated ${res.updatedCount} student(s) as Paid (₱${res.totalCollectedAmount.toLocaleString()} posted directly to SAS Student Contribution & Retained Funds).`
          : `Updated ${res.updatedCount} student(s) as Paid (₱${res.totalCollectedAmount.toLocaleString()} added to Live Cash On Hand & synced to Mobile App).`
      );
      setCashierPreview(null);
      setCashierFileName('');
      setBatchReferenceNo('');
      setBatchReceiptProof(null);
    } catch (err: any) {
      console.error('[handleConfirmCashierImport] Failed:', err);
      toast.error(err?.message || 'Failed to apply Cashier payment file.');
    } finally {
      setIsApplyingCashier(false);
    }
  };

  const handleToggleQR = async (payableId: string, currentUnlocked: boolean) => {
    if (!canManagePayments) return;
    setTogglingId(payableId);
    try {
      await toggleQRTicketUnlock(payableId, !currentUnlocked);
    } catch (err) {
      console.error('Failed to toggle QR code unlock:', err);
      alert('Error updating QR ticket state.');
    } finally {
      setTogglingId(null);
    }
  };

  const handleSyncPayablesData = async (isManual = true) => {
    setIsSyncing(true);
    try {
      // Generate missing student payables whenever empty OR manually synced (deduplicated per student),
      // so partial runs (e.g. >500 students) and newly enrolled students are always backfilled cleanly.
      let backfilledCount = 0;
      if (payables.length === 0 || isManual) {
        const [actSnap, evtSnap, propSnap, rootPropSnap] = await Promise.all([
          getDoc(doc(db, 'activities', eventId)),
          getDoc(doc(db, 'events', eventId)),
          getDoc(doc(db, 'activity_proposals', eventId)),
          getDoc(doc(db, 'proposals', eventId)),
        ]);

        const mergedSource: Record<string, any> = {
          ...(rootPropSnap.exists() ? rootPropSnap.data() : {}),
          ...(evtSnap.exists() ? evtSnap.data() : {}),
          ...(actSnap.exists() ? actSnap.data() : {}),
          ...(propSnap.exists() ? propSnap.data() : {}),
        };

        if (Object.keys(mergedSource).length > 0) {
          const derivedRate =
            Number(mergedSource.adminFeeOverride) ||
            Number(mergedSource.studentContributionRate) ||
            Number(mergedSource.suggestedFeePerStudent) ||
            Number(mergedSource.feeAmount) ||
            Number(adminFeeAmount) ||
            0;

          const genResult = await generatePayablesForEvent(
            {
              ...mergedSource,
              proposalStatus: 'approved',
              isApproved: true,
              studentPayablesEnabled:
                Boolean(mergedSource.studentPayablesEnabled) ||
                ((mergedSource.fundingSource === 'student_contributions' || derivedRate > 0) &&
                  derivedRate > 0),
              studentContributionRate:
                Number(mergedSource.studentContributionRate) || derivedRate,
              feeAmount: derivedRate,
            },
            eventId,
            recordedByUid
          );
          backfilledCount = genResult.createdCount || 0;

          if (payables.length === 0) {
            if (isManual) {
              if (backfilledCount > 0) {
                toast.success(
                  `Generated ${backfilledCount} student payable record(s) and synced to Mobile App.`
                );
              } else {
                toast.info(
                  genResult.skippedReason || 'No student payables were generated for this event.'
                );
              }
            }
            return;
          }
        } else if (payables.length === 0) {
          if (isManual) {
            toast.info('Event source record not found to generate student payables.');
          }
          return;
        }
      }

      // Update missing fields in existing Firestore payables documents (chunked at 450 to respect Firestore's 500-op batch limit)
      if (payables.length > 0) {
        const pendingUpdates: Array<{ ref: any; updates: Record<string, any> }> = [];
        for (const p of payables) {
          const name = getStudentDisplayName(p);
          const schoolId = getStudentDisplayId(p);
          const ref = doc(db, 'payables', p.id);

          const updates: Record<string, any> = {};
          if (!p.studentName || p.studentName === 'Student') updates.studentName = name;
          if (!p.studentSchoolId || p.studentSchoolId !== schoolId) updates.studentSchoolId = schoolId;

          const requiresPayment = (p.assignedAmount || 0) > 0;
          if (!requiresPayment && isQREnabled && !isCancelled) {
            if (!p.qrTicketUnlocked) updates.qrTicketUnlocked = true;
            if (p.status !== 'paid' && p.status !== 'waived') updates.status = 'paid';
          } else if (isQREnabled && p.qrTicketUnlocked === undefined) {
            updates.qrTicketUnlocked = false;
          }

          if (Object.keys(updates).length > 0) {
            pendingUpdates.push({ ref, updates });
          }
        }

        const CHUNK_SIZE = 450;
        for (let i = 0; i < pendingUpdates.length; i += CHUNK_SIZE) {
          const batch = writeBatch(db);
          for (const item of pendingUpdates.slice(i, i + CHUNK_SIZE)) {
            batch.update(item.ref, item.updates);
          }
          await batch.commit();
        }
      }
      if (isManual) {
        if (backfilledCount > 0) {
          toast.success(`Synced & added ${backfilledCount} missing student payable(s) to the roster.`);
        } else {
          toast.success('Student payables roster synced successfully!');
        }
      }
    } catch (err) {
      console.error('Error syncing payables:', err);
      if (isManual) {
        toast.error('Failed to sync payables database records.');
      }
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    if (
      !loading &&
      payables.length === 0 &&
      eventId &&
      autoSyncedEventRef.current !== eventId &&
      (isQREnabled || Number(adminFeeAmount || 0) > 0)
    ) {
      autoSyncedEventRef.current = eventId;
      handleSyncPayablesData(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, payables.length, isQREnabled, adminFeeAmount, eventId]);

  if (loading) {
    return (
      <div className="bg-white border border-[#E0E0E0] rounded-xl p-8 text-center space-y-2">
        <Loader2 className="w-6 h-6 animate-spin text-[#0E4EBD] mx-auto" />
        <p className="text-gray-500 text-xs font-medium">
          {isQREnabled
            ? 'Loading event student payables & QR access control...'
            : 'Loading event student contribution payables...'}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#E0E0E0] rounded-xl overflow-hidden shadow-sm space-y-0">
      {/* Header Banner */}
      <div className="bg-[#001A4D] text-white p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Coins className="w-5 h-5 text-[#FFC107]" />
            <h3 className="text-lg font-bold">
              {isQREnabled ? 'Student Payables & QR Access Control' : 'Student Contribution Payables'}
            </h3>
          </div>
          <p className="text-gray-300 text-xs">
            {!isQREnabled
              ? canUseCashierFile
                ? `Track student contribution payables and upload Cashier Collected files for ${eventTitle}`
                : canManagePayments
                ? `Manage student fee collections and payment settlement for ${eventTitle}`
                : `View student payables roster and payment records for ${eventTitle}`
              : canManagePayments
              ? `Manage student payments and explicitly unlock or lock event QR ticket entry for ${eventTitle}`
              : `View student payables roster and QR ticket entry status for ${eventTitle}`}
          </p>
        </div>

        {/* Metrics Summary & Sync Action */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="bg-white/10 px-3.5 py-2 rounded-lg border border-white/10">
            <p className="text-gray-400 text-[10px] uppercase font-semibold">Total Collection</p>
            <p className="font-bold text-sm text-[#FFC107]">{formatCurrency(totalCollected)} <span className="text-gray-300 font-normal text-xs">/ {formatCurrency(totalAssigned)}</span></p>
          </div>
          {isQREnabled && (
            <div className="bg-white/10 px-3.5 py-2 rounded-lg border border-white/10">
              <p className="text-gray-400 text-[10px] uppercase font-semibold">Unlocked Tickets</p>
              <p className="font-bold text-sm text-emerald-400">
                {unlockedCount} <span className="text-gray-300 font-normal text-xs">/ {payables.length}</span>
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={handleExportRoster}
            className="bg-white/15 hover:bg-white/25 text-white border border-white/25 px-3 py-2 rounded-lg font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Download selected students Excel roster for Cashier collection"
          >
            <Download className="w-3.5 h-3.5 text-[#FFC107]" />
            Export Roster (.xlsx)
          </button>
          {canUseCashierFile && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleCashierFileSelected}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="bg-emerald-500 hover:bg-emerald-600 text-white px-3.5 py-2 rounded-lg font-bold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
                title="Upload Cashier's collected/paid students file to mark payables Paid & credit SAO Fund"
              >
                <Upload className="w-3.5 h-3.5" />
                Upload Cashier Collected File
              </button>
            </>
          )}
          <button
            onClick={() => handleSyncPayablesData(true)}
            disabled={isSyncing}
            className="bg-[#FFC107] hover:bg-[#F59E0B] text-[#001A4D] px-3.5 py-2 rounded-lg font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
            title="Sync missing student names, 11-digit STI IDs, or generate payables"
          >
            {isSyncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Sync Roster Data
          </button>
        </div>
      </div>

      {/* Live Cash-On-Hand & Collection Gap Tracker */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 p-4 bg-slate-50 border-b border-slate-200 text-xs">
        <div className="p-3 bg-white rounded-xl border border-slate-200">
          <span className="text-[10px] font-bold uppercase text-slate-500 block">Target Collectible</span>
          <span className="text-base font-black font-mono text-slate-900">{formatCurrency(totalAssigned)}</span>
          <span className="text-[10px] text-slate-500 block mt-0.5">{payables.length} student(s) billed</span>
        </div>
        <div className="p-3 bg-emerald-50/80 rounded-xl border border-emerald-200">
          <span className="text-[10px] font-bold uppercase text-emerald-700 block">Collected Cash (Cashier)</span>
          <span className="text-base font-black font-mono text-emerald-900">{formatCurrency(totalCollected)}</span>
          <span className="text-[10px] text-emerald-700 block mt-0.5">{paidCount} student(s) paid</span>
        </div>
        <div className="p-3 bg-blue-50/80 rounded-xl border border-blue-200">
          <span className="text-[10px] font-bold uppercase text-blue-700 block">Spendable Cash On Hand Now</span>
          <span className="text-base font-black font-mono text-[#001A4D]">{formatCurrency(spendableCashOnHand)}</span>
          <span className="text-[10px] text-blue-700 block mt-0.5">
            {appliedRetainedAmount > 0 ? `Includes ${formatCurrency(appliedRetainedAmount)} retained` : 'Max cash custodians can spend'}
          </span>
        </div>
        <div className="p-3 bg-amber-50/80 rounded-xl border border-amber-200">
          <span className="text-[10px] font-bold uppercase text-amber-800 block">Uncollected Receivables</span>
          <span className="text-base font-black font-mono text-amber-900">{formatCurrency(uncollectedReceivables)}</span>
          <span className="text-[10px] text-amber-800 block mt-0.5">{unpaidCount} student(s) still unpaid</span>
        </div>
      </div>

      {/* Notice Banner when Event is Cancelled or Admin is viewing a club event or QR is disabled */}
      {isCancelled ? (
        <div className="p-4 bg-red-50 border-b border-red-200 flex items-start gap-3 text-xs text-red-900">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <p className="font-bold text-red-900">
                {isQREnabled
                  ? 'Event Cancelled — Payment Collections & QR Gate Passes Closed'
                  : 'Event Cancelled — Payment Collections Closed'}
              </p>
              <span className="px-2 py-0.5 bg-red-100 text-red-700 font-semibold rounded text-[10px] uppercase tracking-wide">
                Cancelled
              </span>
            </div>
            <p className="text-red-700 text-[11px] mt-0.5 leading-relaxed">
              {isQREnabled
                ? 'This event has been cancelled. Recording payments and unlocking QR attendance passes are disabled. Unpaid payables have been waived and any collected fees have been queued for refund in the Finance Center.'
                : 'This event has been cancelled. Fee collections are closed. Unpaid payables have been waived and any collected fees have been queued for refund in the Finance Center.'}
            </p>
          </div>
        </div>
      ) : isQREnabled && (!adminFeeAmount || adminFeeAmount <= 0) && (payables.length === 0 || payables.every(p => (p.assignedAmount || 0) <= 0)) ? (
        <div className="p-3.5 bg-emerald-50 border-b border-emerald-200 flex items-start gap-2.5 text-xs text-emerald-900">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-emerald-950">Free Event — QR Tickets Unlocked by Default</p>
            <p className="text-emerald-800 text-[11px] mt-0.5">
              This event does not require students to pay any fees. All eligible student QR tickets are unlocked by default for gate access and attendance scanning.
            </p>
          </div>
        </div>
      ) : !canManagePayments && (
        <div className="p-3.5 bg-amber-50 border-b border-amber-200 flex items-start gap-2.5 text-xs text-amber-900">
          <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">
              {isQREnabled ? 'Club-Managed Event Fee & QR Gate Access' : 'Club-Managed Student Contribution Collections'}
            </p>
            <p className="text-amber-800 text-[11px] mt-0.5">
              {isQREnabled
                ? `Payment collection and QR ticket unlocking for this event are handled directly by ${hostingOrgName ? `the ${hostingOrgName} officers` : 'the club officers'}. The SAS Admin view is read-only for institutional monitoring.`
                : `Payment collections for this event are handled directly by ${hostingOrgName ? `the ${hostingOrgName} officers` : 'the club officers'}. The SAS Admin view is read-only for institutional monitoring.`}
            </p>
          </div>
        </div>
      )}

      {/* Toolbar: Search & Status Filters */}
      <div className="p-4 border-b border-[#E0E0E0] bg-gray-50 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search student name, school ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-[#001A4D] bg-white"
          />
        </div>

        {/* Filter Badges */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {(
            [
              { id: 'all', label: `All (${payables.length})` },
              { id: 'unpaid', label: `Unpaid (${unpaidCount})` },
              { id: 'paid', label: `Paid (${paidCount})` },
              ...(isQREnabled
                ? [
                    { id: 'locked' as const, label: `Locked (${lockedCount})` },
                    { id: 'unlocked' as const, label: `Unlocked (${unlockedCount})` },
                  ]
                : []),
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              onClick={() => setStatusFilter(f.id)}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all text-xs cursor-pointer ${
                statusFilter === f.id
                  ? 'bg-[#001A4D] text-white shadow-xs'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Payables Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-gray-50 text-gray-500 font-bold border-b border-[#E0E0E0] uppercase text-[10px] tracking-wider">
              <th className="px-5 py-3">Student Name</th>
              <th className="px-5 py-3">School ID</th>
              <th className="px-5 py-3">Fee Amount</th>
              <th className="px-5 py-3">Paid Amount</th>
              <th className="px-5 py-3">Payment Status</th>
              {isQREnabled && <th className="px-5 py-3">QR Ticket Access</th>}
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E0E0E0]">
            {filteredPayables.map((payable) => {
              const isPaid = payable.status === 'paid';
              const isWaived = payable.status === 'waived';
              const isRefundPending = payable.status === 'refund_pending';
              const isRefunded = payable.status === 'refunded';
              const isPartial = payable.status === 'partial';
              const isUnlocked = !isCancelled && !!payable.qrTicketUnlocked;

              return (
                <tr key={payable.id} className="hover:bg-gray-50/80 transition-colors">
                  <td className="px-5 py-3.5 font-bold text-[#001A4D]">
                    {getStudentDisplayName(payable)}
                  </td>
                  <td className="px-5 py-3.5 font-mono text-gray-600">
                    {getStudentDisplayId(payable)}
                  </td>
                  <td className="px-5 py-3.5 font-semibold text-[#001A4D]">
                    {(!payable.assignedAmount || payable.assignedAmount <= 0) ? 'Free (₱0.00)' : formatCurrency(payable.assignedAmount)}
                  </td>
                  <td className="px-5 py-3.5 font-semibold text-emerald-700">
                    {formatCurrency(payable.paidAmount || 0)}
                  </td>
                  <td className="px-5 py-3.5">
                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                        (!payable.assignedAmount || payable.assignedAmount <= 0)
                          ? 'bg-emerald-100 text-emerald-800'
                          : isPaid
                          ? 'bg-emerald-100 text-emerald-800'
                          : isPartial
                          ? 'bg-amber-100 text-amber-800'
                          : isWaived
                          ? 'bg-gray-100 text-gray-700'
                          : isRefundPending
                          ? 'bg-amber-50 text-amber-800 border border-amber-300'
                          : isRefunded
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {(!payable.assignedAmount || payable.assignedAmount <= 0) ? 'Free Entry' : payable.status}
                    </span>
                  </td>
                  {isQREnabled && (
                    <td className="px-5 py-3.5">
                      {isCancelled ? (
                        <span
                          className="px-2.5 py-1 rounded-lg text-[11px] font-bold inline-flex items-center gap-1.5 bg-gray-100 text-gray-500 border border-gray-200"
                          title="Gate pass revoked due to event cancellation"
                        >
                          <Lock className="w-3.5 h-3.5 text-gray-400" />
                          <span>Revoked</span>
                        </span>
                      ) : canManagePayments ? (
                        <button
                          onClick={() => handleToggleQR(payable.id, isUnlocked)}
                          disabled={togglingId === payable.id}
                          className={`px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                            isUnlocked
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-100'
                              : 'bg-amber-50 text-amber-800 border border-amber-300 hover:bg-amber-100'
                          }`}
                          title="Click to toggle QR ticket access status"
                        >
                          {togglingId === payable.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : isUnlocked ? (
                            <>
                              <Unlock className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Unlocked</span>
                            </>
                          ) : (
                            <>
                              <Lock className="w-3.5 h-3.5 text-amber-700" />
                              <span>Locked</span>
                            </>
                          )}
                        </button>
                      ) : (
                        <span
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold inline-flex items-center gap-1.5 ${
                            isUnlocked
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-amber-50 text-amber-800 border border-amber-200'
                          }`}
                        >
                          {isUnlocked ? (
                            <>
                              <Unlock className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Unlocked</span>
                            </>
                          ) : (
                            <>
                              <Lock className="w-3.5 h-3.5 text-amber-700" />
                              <span>Locked</span>
                            </>
                          )}
                        </span>
                      )}
                    </td>
                  )}
                  <td className="px-5 py-3.5 text-right">
                    {isCancelled ? (
                      isWaived ? (
                        <span className="px-2.5 py-1 bg-gray-100 text-gray-600 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1">
                          <XCircle className="w-3 h-3 text-gray-400" /> Waived
                        </span>
                      ) : isRefundPending ? (
                        <span className="px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1">
                          <Clock className="w-3 h-3 text-amber-600" /> Refund Pending
                        </span>
                      ) : isRefunded ? (
                        <span className="px-2.5 py-1 bg-purple-50 text-purple-700 border border-purple-200 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1">
                          <RotateCcw className="w-3 h-3 text-purple-600" /> Refunded
                        </span>
                      ) : isPaid ? (
                        <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Paid
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 bg-red-50 text-red-700 border border-red-200 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1">
                          <AlertCircle className="w-3 h-3 text-red-600" /> Cancelled
                        </span>
                      )
                    ) : isPaid ? (
                      <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Settled
                      </span>
                    ) : isWaived ? (
                      <span className="px-2.5 py-1 bg-gray-100 text-gray-500 rounded-lg text-[11px] font-semibold inline-block">
                        Waived
                      </span>
                    ) : isRefundPending ? (
                      <span className="px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-lg text-[11px] font-semibold inline-block">
                        Refund Pending
                      </span>
                    ) : isRefunded ? (
                      <span className="px-2.5 py-1 bg-purple-50 text-purple-700 border border-purple-200 rounded-lg text-[11px] font-semibold inline-block">
                        Refunded
                      </span>
                    ) : canManagePayments && !canUseCashierFile ? (
                      <button
                        onClick={() => setSelectedPayable(payable)}
                        className="px-3 py-1.5 bg-[#001A4D] hover:bg-[#001A4D]/90 text-white rounded-lg font-bold text-[11px] transition-colors shadow-sm inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Coins className="w-3.5 h-3.5 text-[#FFC107]" />
                        Record Payment
                      </button>
                    ) : canUseCashierFile ? (
                      <span className="px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-lg text-[11px] font-semibold inline-block">
                        Awaiting Cashier Upload
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 bg-gray-100 text-gray-500 rounded-lg text-[11px] font-semibold inline-block">
                        Club Managed
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}

            {filteredPayables.length === 0 && (
              <tr>
                <td colSpan={isQREnabled ? 7 : 6} className="px-5 py-10 text-center text-gray-400 text-xs">
                  {payables.length === 0
                    ? 'No student payables found for this event. Click "Sync Roster Data" to generate payables from this proposal.'
                    : 'No student payables match your search criteria.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer info */}
      <div className="p-4 bg-gray-50 border-t border-[#E0E0E0] flex items-center justify-between text-xs text-gray-500">
        <span>Showing {filteredPayables.length} of {payables.length} student records</span>
        <span className="text-[11px] text-gray-400">
          {isCancelled
            ? isQREnabled
              ? 'Event is cancelled: Cash payment recording and QR ticket unlocking are disabled.'
              : 'Event is cancelled: Student fee collections are closed.'
            : canUseCashierFile
            ? 'Payments are recorded exclusively via Cashier Collected Excel uploads.'
            : canManagePayments
            ? isQREnabled
              ? 'Advisers & Officers have permission to record cash payments and manage QR ticket gate access'
              : 'Advisers & Officers have permission to record cash payments for student contributions.'
            : isQREnabled
            ? 'Payment collections and QR ticket unlocking for club events are managed by student officers.'
            : 'Payment collections for club events are managed by student officers.'}
        </span>
      </div>

      {/* Record Payment Modal (Officer / Club events only — SAS uses Cashier Excel upload as source of truth) */}
      {selectedPayable && canManagePayments && !canUseCashierFile && !isCancelled && (
        <AdminRecordPaymentModal
          payable={selectedPayable}
          onClose={() => setSelectedPayable(null)}
          recordedByUid={recordedByUid}
          resolvedName={getStudentDisplayName(selectedPayable)}
          resolvedSchoolId={getStudentDisplayId(selectedPayable)}
          isQREnabled={isQREnabled}
        />
      )}

      {/* Cashier Upload Preview & Confirmation Modal */}
      {cashierPreview && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-[#001A4D] text-white px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <FileSpreadsheet className="w-5 h-5 text-[#FFC107]" />
                <div>
                  <h4 className="text-sm font-bold">Cashier Collected Students — Upload Preview</h4>
                  <p className="text-[11px] text-slate-300 truncate max-w-md">{cashierFileName}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCashierPreview(null)}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    Verified Header &amp; Activity Title:{' '}
                    <strong>{cashierPreview.detectedActivityTitle || eventTitle}</strong>
                  </span>
                </div>
                <span className="text-[11px] font-semibold text-emerald-800">
                  +{cashierPreview.matchedToMarkPaid.length} newly paid • {cashierPreview.alreadyPaid.length} previously paid skipped
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                  <span className="block text-[10px] font-bold uppercase text-emerald-700">Newly Paid</span>
                  <span className="text-lg font-black text-emerald-900">
                    +{cashierPreview.matchedToMarkPaid.length}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-blue-50 border border-blue-200">
                  <span className="block text-[10px] font-bold uppercase text-blue-700">New Fund Added</span>
                  <span className="text-lg font-black text-[#001A4D]">
                    +{formatCurrency(cashierPreview.totalNewCollectionAmount)}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="block text-[10px] font-bold uppercase text-slate-500">Already Paid</span>
                  <span className="text-lg font-black text-slate-700">
                    {cashierPreview.alreadyPaid.length}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
                  <span className="block text-[10px] font-bold uppercase text-amber-700">Unmatched</span>
                  <span className="text-lg font-black text-amber-900">
                    {cashierPreview.unmatched.length}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Cashier Batch / Summary Reference No. (Optional)
                  </label>
                  <input
                    type="text"
                    value={batchReferenceNo}
                    onChange={(e) => setBatchReferenceNo(e.target.value)}
                    placeholder="e.g., CASHIER-OR-2026-1117"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-[#001A4D] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Cashier OR / Batch Receipt Proof (Optional)
                  </label>
                  <input
                    ref={receiptInputRef}
                    type="file"
                    accept="image/*,.pdf"
                    onChange={handleBatchReceiptUpload}
                    className="hidden"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => receiptInputRef.current?.click()}
                      disabled={isUploadingReceipt}
                      className="px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 text-xs font-bold text-slate-700 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {isUploadingReceipt ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Upload className="w-3.5 h-3.5 text-[#0E4EBD]" />
                      )}
                      <span>{batchReceiptProof ? 'Replace Proof' : 'Attach Cashier Receipt'}</span>
                    </button>
                    {batchReceiptProof && (
                      <a
                        href={batchReceiptProof.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] font-semibold text-emerald-700 hover:underline truncate max-w-[140px]"
                      >
                        {batchReceiptProof.fileName}
                      </a>
                    )}
                  </div>
                </div>
              </div>

              {cashierPreview.matchedToMarkPaid.length > 0 ? (
                <div className="border border-slate-200 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Student ID</th>
                        <th className="px-3 py-2">Name</th>
                        <th className="px-3 py-2 text-right">Paid Amount</th>
                        <th className="px-3 py-2">OR #</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {cashierPreview.matchedToMarkPaid.map((row) => (
                        <tr key={row.payable.id}>
                          <td className="px-3 py-2 font-mono">{getStudentDisplayId(row.payable)}</td>
                          <td className="px-3 py-2 font-medium text-slate-800">
                            {getStudentDisplayName(row.payable)}
                          </td>
                          <td className="px-3 py-2 text-right font-bold text-emerald-700">
                            {formatCurrency(row.paidAmount)}
                          </td>
                          <td className="px-3 py-2 text-slate-500 font-mono">
                            {row.orNumber || batchReferenceNo || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
                  No new unpaid students matched in this file.
                  {cashierPreview.alreadyPaid.length > 0
                    ? ` (${cashierPreview.alreadyPaid.length} matched student(s) are already marked Paid.)`
                    : ''}
                </div>
              )}

              {cashierPreview.unmatched.length > 0 && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-[11px] text-rose-900 space-y-1">
                  <strong className="block">
                    {cashierPreview.unmatched.length} unmatched row(s) skipped:
                  </strong>
                  <div className="max-h-24 overflow-y-auto space-y-0.5 font-mono">
                    {cashierPreview.unmatched.slice(0, 15).map((u, i) => (
                      <div key={i}>
                        Row {u.rowNumber}: {u.studentIdInput || u.studentNameInput} — {u.reason}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setCashierPreview(null)}
                disabled={isApplyingCashier}
                className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmCashierImport}
                disabled={isApplyingCashier || cashierPreview.matchedToMarkPaid.length === 0}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                {isApplyingCashier ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                )}
                Confirm &amp; Mark {cashierPreview.matchedToMarkPaid.length} Paid (
                {formatCurrency(cashierPreview.totalNewCollectionAmount)})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
