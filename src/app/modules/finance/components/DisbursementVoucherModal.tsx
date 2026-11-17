import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Upload,
  FileText,
  FileCheck,
  CheckCircle2,
  ExternalLink,
  Coins,
  Calendar,
  CreditCard,
  Eye,
  Loader2,
  Lock,
  Shield,
  AlertTriangle,
} from 'lucide-react';
import { Landmark, Check } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import { uploadToCloudinary } from '../../../../services/cloudinary';
import { saveEventDisbursementVoucher } from '../../events/services/event.service';
import type { EventDocument } from '../../events/types/event.types';
import type { DisbursementVoucherAttachment } from '../types/liquidation.types';
import { formatCurrency } from '../../../utils/currency';
import { toast } from 'sonner';
import { isSasCreatedEvent } from '../../events/utils/organization-display.utils';
import { useMiscFeeConfigs } from '../hooks/useMiscFeeStream';
import { useEventPayablesStream } from '../hooks/usePayableStream';

interface DisbursementVoucherModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: EventDocument;
  userProfile?: {
    uid?: string;
    displayName?: string;
    fullName?: string;
    name?: string;
    email?: string;
    role?: string;
    isAdviser?: boolean;
  };
  userRole?: 'adviser' | 'admin' | 'officer' | string;
  liquidationStatus?: string;
  readOnly?: boolean;
  onVoucherSaved?: (voucher: DisbursementVoucherAttachment) => void;
  onVoucherRemoved?: () => void;
}

function getTodayLocalDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function DisbursementVoucherModal({
  isOpen,
  onClose,
  event,
  userProfile,
  userRole = 'adviser',
  liquidationStatus,
  readOnly = false,
  onVoucherSaved,
  onVoucherRemoved,
}: DisbursementVoucherModalProps) {
  const existingVoucher = event.disbursementVoucher;
  const todayStr = useMemo(() => getTodayLocalDate(), []);

  // Lifecycle & Role Based Read-Only Controls:
  // 1. Student officers have read-only inspection access
  // 2. Once liquidation is submitted to signatories (under_review / pending) or approved, the voucher is locked
  // 3. SAS Admin viewing an organization's activity cannot upload disbursement receipts (Read-Only)
  const isOfficer = (userRole === 'officer' || userProfile?.role === 'officer') && !userProfile?.isAdviser;
  const isAdmin = userRole === 'admin' || userProfile?.role === 'admin' || userProfile?.role === 'sas_admin' || userRole === 'sas_admin';
  const isOrgEvent = !isSasCreatedEvent(event);
  const isSasAdminOnOrgEvent = isAdmin && isOrgEvent;

  const normalizedStatus = (liquidationStatus || (event as any)?.liquidationStatus || '').toString().toLowerCase().trim();
  const isSubmittedOrApproved =
    normalizedStatus === 'under_review' ||
    normalizedStatus === 'pending' ||
    normalizedStatus === 'approved' ||
    normalizedStatus === 'submitted';

  const isAlreadyAttached = Boolean(existingVoucher?.fileUrl);
  const isLockedByLiquidation = isAlreadyAttached && isSubmittedOrApproved;
  const isEffectiveReadOnly = Boolean(
    readOnly || isOfficer || isAlreadyAttached || isLockedByLiquidation || isSasAdminOnOrgEvent
  );

  const [fileUrl, setFileUrl] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [fileType, setFileType] = useState<'image' | 'pdf' | 'document' | 'other'>('image');
  const [fileSize, setFileSize] = useState<number | undefined>(undefined);
  const [publicId, setPublicId] = useState<string | undefined>(undefined);

  const [chequeNumber, setChequeNumber] = useState<string>('');
  const [disbursementDate, setDisbursementDate] = useState<string>('');
  const [remarks, setRemarks] = useState<string>('');
  const { saoEligibleBuckets } = useMiscFeeConfigs();
  const [proposalFallbackData, setProposalFallbackData] = useState<Record<string, any> | null>(null);
  const [legacyFallbackBucketId, setLegacyFallbackBucketId] = useState<string>('');

  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);

  // Hydrate AP funding/bucket config from `activity_proposals/{event.id}` if missing on the passed event doc
  useEffect(() => {
    if (!isOpen || !event?.id) return;
    const evAny = event as any;
    const hasAlloc = Array.isArray(evAny.allocations) && evAny.allocations.length > 0;
    const hasBucketMeta = Boolean(
      evAny.miscFeeBucketId ||
        (Array.isArray(evAny.miscFeeBucketIds) && evAny.miscFeeBucketIds.length > 0) ||
        (Array.isArray(evAny.miscFeeBucketAllocations) && evAny.miscFeeBucketAllocations.length > 0)
    );
    if (hasAlloc || hasBucketMeta) {
      setProposalFallbackData(null);
      return;
    }

    let cancelled = false;
    getDoc(doc(db, 'activity_proposals', event.id))
      .then((snap) => {
        if (!cancelled && snap.exists()) {
          setProposalFallbackData(snap.data() as Record<string, any>);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [isOpen, event]);

  const approvedCeiling = useMemo(
    () =>
      Number(
        existingVoucher?.amountDisbursed ||
          event.totalApprovedBudget ||
          (event as any).allocatedBudget ||
          (event as any).approvedBudget ||
          proposalFallbackData?.financialProjections?.totalExpenses ||
          0
      ),
    [existingVoucher, event, proposalFallbackData]
  );

  const effectiveFundingSource = String(
    event.fundingSource || proposalFallbackData?.fundingSource || 'school_budget'
  );
  const { data: eventPayables = [] } = useEventPayablesStream(
    effectiveFundingSource === 'student_contributions' ? event?.id || '' : ''
  );

  const contribCashSummary = useMemo(() => {
    const collected =
      Math.round(
        eventPayables
          .filter((p) => String(p.status || '').toLowerCase() === 'paid')
          .reduce((s, p) => s + (Number(p.paidAmount) || Number(p.assignedAmount) || 0), 0) * 100
      ) / 100;
    const allocs: any[] = Array.isArray((event as any).allocations)
      ? (event as any).allocations
      : Array.isArray(proposalFallbackData?.allocations)
      ? proposalFallbackData!.allocations
      : [];
    const retainedApplied =
      Math.round(
        allocs
          .filter((a) => a.fundType === 'student_contribution_retained')
          .reduce((s, a) => s + (Number(a.allocatedAmount) || 0), 0) * 100
      ) / 100;
    const projectedTotal =
      Math.round(
        eventPayables
          .filter((p) => !['cancelled', 'waived', 'refunded'].includes(String(p.status || '').toLowerCase()))
          .reduce((s, p) => s + (Number(p.assignedAmount) || 0), 0) * 100
      ) / 100;
    const cashOnHand = Math.round((collected + retainedApplied) * 100) / 100;
    return {
      collected,
      retainedApplied,
      cashOnHand,
      uncollected: Math.max(0, Math.round((projectedTotal - collected) * 100) / 100),
    };
  }, [eventPayables, event, proposalFallbackData]);

  // Auto-detect configured Miscellaneous Fee bucket(s) and exact AP split (1 or 2+ buckets)
  const autoDetectedBuckets = useMemo(() => {
    const evAny = event as any;
    const rawAllocs: any[] =
      Array.isArray(evAny.allocations) && evAny.allocations.length > 0
        ? evAny.allocations.filter((a: any) => a.fundType === 'misc_fee')
        : Array.isArray(proposalFallbackData?.allocations) && proposalFallbackData!.allocations.length > 0
          ? proposalFallbackData!.allocations.filter((a: any) => a.fundType === 'misc_fee')
          : [];

    const legacyBucketAllocs: any[] =
      Array.isArray(evAny.miscFeeBucketAllocations) && evAny.miscFeeBucketAllocations.length > 0
        ? evAny.miscFeeBucketAllocations
        : Array.isArray(proposalFallbackData?.miscFeeBucketAllocations)
          ? proposalFallbackData!.miscFeeBucketAllocations
          : [];

    const rawIds: string[] = Array.from(
      new Set(
        [
          ...rawAllocs.map((a: any) => a.bucketId),
          ...legacyBucketAllocs.map((a: any) => a.bucketId),
          ...(Array.isArray(evAny.miscFeeBucketIds) ? evAny.miscFeeBucketIds : []),
          ...(Array.isArray(proposalFallbackData?.miscFeeBucketIds)
            ? proposalFallbackData!.miscFeeBucketIds
            : []),
          evAny.miscFeeBucketId,
          proposalFallbackData?.miscFeeBucketId,
        ].filter(Boolean)
      )
    );

    const resolveBucketMeta = (id: string, fallbackName?: string) =>
      saoEligibleBuckets.find(
        (cb) =>
          cb.bucket.id === id ||
          (fallbackName && cb.bucket.particular.toLowerCase() === fallbackName.toLowerCase())
      );

    // Build unified list with configured or proportional pull amounts
    if (rawIds.length === 0 && (evAny.miscFeeBucketName || proposalFallbackData?.miscFeeBucketName)) {
      const nameStr = String(evAny.miscFeeBucketName || proposalFallbackData?.miscFeeBucketName);
      const match = resolveBucketMeta('', nameStr);
      if (match) {
        return [
          {
            bucketId: match.bucket.id,
            bucketName: match.bucket.particular,
            allocatedAmount: approvedCeiling,
            availableAmount: match.currentAvailable,
          },
        ];
      }
    }

    if (rawIds.length === 1) {
      const id = rawIds[0];
      const allocRow = rawAllocs.find((a: any) => a.bucketId === id) || legacyBucketAllocs.find((a: any) => a.bucketId === id);
      const live = resolveBucketMeta(id, allocRow?.bucketName || evAny.miscFeeBucketName);
      return [
        {
          bucketId: live?.bucket.id || id,
          bucketName: live?.bucket.particular || allocRow?.bucketName || evAny.miscFeeBucketName || id,
          allocatedAmount: Number(allocRow?.allocatedAmount) > 0 ? Number(allocRow.allocatedAmount) : approvedCeiling,
          availableAmount: live ? live.currentAvailable : Number(allocRow?.availableAmount || 0),
        },
      ];
    }

    if (rawIds.length >= 2) {
      const totalExplicit = rawIds.reduce((sum, id) => {
        const r = rawAllocs.find((a: any) => a.bucketId === id) || legacyBucketAllocs.find((a: any) => a.bucketId === id);
        return sum + (Number(r?.allocatedAmount) || 0);
      }, 0);

      let remaining = approvedCeiling;
      return rawIds.map((id, idx) => {
        const allocRow = rawAllocs.find((a: any) => a.bucketId === id) || legacyBucketAllocs.find((a: any) => a.bucketId === id);
        const live = resolveBucketMeta(id, allocRow?.bucketName);
        const avail = live ? live.currentAvailable : Number(allocRow?.availableAmount || 0);

        let pullAmount = Number(allocRow?.allocatedAmount) || 0;
        if (totalExplicit <= 0) {
          if (idx === rawIds.length - 1) {
            pullAmount = Math.max(0, Math.round(remaining * 100) / 100);
          } else {
            const totalAvail = rawIds.reduce((s, xId) => {
              const lr = legacyBucketAllocs.find((a: any) => a.bucketId === xId);
              const lm = resolveBucketMeta(xId, lr?.bucketName);
              return s + (lm ? lm.currentAvailable : Number(lr?.availableAmount || 0));
            }, 0);
            pullAmount =
              totalAvail > 0
                ? Math.round((approvedCeiling * (avail / totalAvail)) * 100) / 100
                : Math.round((approvedCeiling / rawIds.length) * 100) / 100;
            remaining = Math.max(0, Math.round((remaining - pullAmount) * 100) / 100);
          }
        }

        return {
          bucketId: live?.bucket.id || id,
          bucketName: live?.bucket.particular || allocRow?.bucketName || id,
          allocatedAmount: pullAmount,
          availableAmount: avail,
        };
      });
    }

    // No buckets pre-configured on AP: auto-select if there is only 1 eligible bucket in the system
    if (effectiveFundingSource === 'school_budget' && saoEligibleBuckets.length === 1) {
      const only = saoEligibleBuckets[0];
      return [
        {
          bucketId: only.bucket.id,
          bucketName: only.bucket.particular,
          allocatedAmount: approvedCeiling,
          availableAmount: only.currentAvailable,
        },
      ];
    }

    return [];
  }, [event, proposalFallbackData, saoEligibleBuckets, approvedCeiling, effectiveFundingSource]);

  // Initialize or reset form when modal opens or event changes
  useEffect(() => {
    if (!isOpen) {
      setShowConfirmModal(false);
      return;
    }

    setShowConfirmModal(false);
    if (existingVoucher && existingVoucher.fileUrl) {
      setFileUrl(existingVoucher.fileUrl);
      setFileName(existingVoucher.fileName || 'Disbursement-Voucher.pdf');
      setFileType(existingVoucher.fileType || 'pdf');
      setFileSize(existingVoucher.fileSize);
      setPublicId(existingVoucher.publicId);
      setChequeNumber(existingVoucher.chequeNumber || '');
      setDisbursementDate(existingVoucher.disbursementDate || '');
      setRemarks(existingVoucher.remarks || '');
    } else {
      setFileUrl('');
      setFileName('');
      setFileType('image');
      setFileSize(undefined);
      setPublicId(undefined);
      setChequeNumber('');
      const today = getTodayLocalDate();
      setDisbursementDate(today);
      setRemarks('');
    }
  }, [isOpen, existingVoucher, event]);

  if (!isOpen) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isEffectiveReadOnly) return;
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate size (10 MB max)
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size exceeds the 10 MB limit.');
      return;
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const isPdf = ext === 'pdf' || file.type.includes('pdf');
    const isImg = ['png', 'jpg', 'jpeg', 'webp'].includes(ext) || file.type.includes('image');

    if (!isPdf && !isImg) {
      toast.error('Only PDF documents and image files (PNG, JPG, WEBP) are supported.');
      return;
    }

    setIsUploading(true);
    setUploadProgress('Uploading document to secure storage...');

    try {
      const result = await uploadToCloudinary(file, {
        folder: 'disbursements/vouchers',
        maxBytes: 10 * 1024 * 1024,
      });

      setFileUrl(result.secureUrl);
      setFileName(file.name);
      setFileType(isPdf ? 'pdf' : 'image');
      setFileSize(file.size);
      setPublicId(result.publicId);
      toast.success('Disbursement Voucher document uploaded successfully!');
    } catch (err: any) {
      console.error('[DisbursementVoucherModal] Upload error:', err);
      toast.error(err?.message || 'Failed to upload document. Please try again.');
    } finally {
      setIsUploading(false);
      setUploadProgress('');
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    if (isEffectiveReadOnly) {
      onClose();
      return;
    }

    if (!fileUrl) {
      toast.error('Please upload the scanned Disbursement Voucher or check release proof.');
      return;
    }

    if (!chequeNumber.trim()) {
      toast.error('Please enter the Cheque / Bank Reference Number.');
      return;
    }

    if (!disbursementDate) {
      toast.error('Please select the Date Disbursed / Released.');
      return;
    }

    // Ban future dates
    if (disbursementDate > todayStr) {
      toast.error('Date Released cannot be in the future. Please select today or an earlier date.');
      return;
    }

    if (
      effectiveFundingSource === 'school_budget' &&
      autoDetectedBuckets.length === 0 &&
      saoEligibleBuckets.length > 0 &&
      !legacyFallbackBucketId
    ) {
      toast.error('Please select a Miscellaneous Fee Particular to deduct from.');
      return;
    }

    const isContributionUnderfunded =
      effectiveFundingSource === 'student_contributions' &&
      approvedCeiling > 0 &&
      contribCashSummary.cashOnHand + 0.009 < approvedCeiling;

    if (isContributionUnderfunded) {
      toast.error(
        `Disbursement Voucher Locked: Total Student Contribution funds reached (${formatCurrency(contribCashSummary.cashOnHand)}) must equal or exceed the proposed budget (${formatCurrency(approvedCeiling)}).`
      );
      return;
    }

    setShowConfirmModal(true);
  };

  const executeConfirmedSave = async () => {
    if (isEffectiveReadOnly) return;

    setIsSaving(true);
    try {
      const uploaderName =
        userProfile?.fullName ||
        userProfile?.displayName ||
        userProfile?.name ||
        (userRole === 'admin' ? 'SAS Administrator' : 'Club Adviser');

      const uploaderRole: 'adviser' | 'admin' = userRole === 'admin' ? 'admin' : 'adviser';
      const effectiveDisbursedAmount = approvedCeiling;

      const payload: DisbursementVoucherAttachment = {
        fileUrl,
        fileName: fileName || 'Disbursement-Voucher',
        fileType,
        fileSize,
        publicId,
        chequeNumber: chequeNumber.trim(),
        disbursementDate,
        amountDisbursed: effectiveDisbursedAmount,
        remarks: remarks.trim(),
        uploadedBy: userProfile?.uid || 'system',
        uploadedByName: uploaderName,
        uploadedByRole: uploaderRole,
        uploadedAt: new Date().toISOString(),
      };

      let resolvedBucketPayload:
        | {
            id?: string;
            name?: string;
            bucketIds?: string[];
            bucketAllocations?: Array<{
              bucketId: string;
              bucketName?: string;
              allocatedAmount?: number;
              availableAmount?: number;
            }>;
          }
        | undefined;

      if (effectiveFundingSource === 'school_budget' || !event.fundingSource) {
        if (autoDetectedBuckets.length > 0) {
          resolvedBucketPayload = {
            id: autoDetectedBuckets[0].bucketId,
            name: autoDetectedBuckets.map((b) => b.bucketName).join(' + '),
            bucketIds: autoDetectedBuckets.map((b) => b.bucketId),
            bucketAllocations: autoDetectedBuckets,
          };
        } else if (legacyFallbackBucketId) {
          const fallbackMatch = saoEligibleBuckets.find(
            (cb) => cb.bucket.id === legacyFallbackBucketId
          );
          if (fallbackMatch) {
            resolvedBucketPayload = {
              id: fallbackMatch.bucket.id,
              name: fallbackMatch.bucket.particular,
              bucketIds: [fallbackMatch.bucket.id],
              bucketAllocations: [
                {
                  bucketId: fallbackMatch.bucket.id,
                  bucketName: fallbackMatch.bucket.particular,
                  allocatedAmount: approvedCeiling,
                  availableAmount: fallbackMatch.currentAvailable,
                },
              ],
            };
          }
        }
      }

      await saveEventDisbursementVoucher(event.id, payload, resolvedBucketPayload);

      if (resolvedBucketPayload?.bucketAllocations && resolvedBucketPayload.bucketAllocations.length > 1) {
        const splitDesc = resolvedBucketPayload.bucketAllocations
          .map((b) => `${b.bucketName}: ${formatCurrency(b.allocatedAmount || 0)}`)
          .join(', ');
        toast.success(
          `Official Disbursement Voucher attached! Auto-deducted ${formatCurrency(approvedCeiling)} across ${resolvedBucketPayload.bucketAllocations.length} buckets (${splitDesc}).`
        );
      } else if (resolvedBucketPayload?.name) {
        toast.success(
          `Official Disbursement Voucher attached! Auto-deducted ${formatCurrency(approvedCeiling)} from "${resolvedBucketPayload.name}".`
        );
      } else {
        toast.success('Official Disbursement Voucher attached and verified!');
      }
      setShowConfirmModal(false);
      onVoucherSaved?.(payload);
      onClose();
    } catch (err: any) {
      console.error('[DisbursementVoucherModal] Save error:', err);
      toast.error(err?.message || 'Failed to save Disbursement Voucher.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150">
        {/* Header Bar */}
        <div className="bg-[#001A4D] text-white px-6 py-4 flex items-center justify-between border-b border-blue-900/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-[#FFD41C] flex items-center justify-center border border-blue-400/30">
              <FileCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                Official Disbursement Voucher
                {isSasAdminOnOrgEvent ? (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-400/30 inline-flex items-center gap-1">
                    <Shield className="w-2.5 h-2.5 text-amber-300" /> Club Managed • Read Only
                  </span>
                ) : isAlreadyAttached ? (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 inline-flex items-center gap-1">
                    <Lock className="w-2.5 h-2.5" /> Attached • Locked
                  </span>
                ) : isEffectiveReadOnly ? (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 inline-flex items-center gap-1">
                    <Lock className="w-2.5 h-2.5" /> View Only
                  </span>
                ) : (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-400/30">
                    Draft
                  </span>
                )}
              </h3>
              <p className="text-xs text-blue-200/80">
                Activity: <strong className="text-white">{event.title}</strong>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSave} className="p-6 space-y-5">
          {/* Approved Budget Context Bar */}
          <div className="p-3.5 bg-gradient-to-r from-blue-50/80 via-white to-slate-50 border border-blue-200 rounded-2xl flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-slate-700">
              <Coins className="w-4 h-4 text-[#0E4EBD]" />
              <span className="font-semibold">Approved Budget Ceiling:</span>
              <strong className="font-mono text-sm text-[#001A4D]">
                {formatCurrency(Number(event.totalApprovedBudget || 0))}
              </strong>
            </div>
            <span className="text-[11px] text-slate-500 font-medium">
              Voucher unlocks Cash Custodians & Liquidation
            </span>
          </div>

          {/* Read-Only Status Alert Banners */}
          {isLockedByLiquidation ? (
            <div className="p-3 bg-amber-50/90 border border-amber-300 rounded-xl flex items-center gap-2.5 text-xs text-amber-900">
              <Lock className="w-4 h-4 text-amber-700 shrink-0" />
              <span>
                <strong>Audit Locked:</strong> This Disbursement Voucher is sealed because the Financial Liquidation is currently <strong>{normalizedStatus.toUpperCase() || 'IN PROGRESS'}</strong>. Modification is disabled during and after signatory review.
              </span>
            </div>
          ) : isAlreadyAttached ? (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-2.5 text-xs text-slate-700">
              <Lock className="w-4 h-4 text-[#001A4D] shrink-0" />
              <span>
                <strong>Finalized Record:</strong> This official Disbursement Voucher has already been submitted and locked. Editing and removal are disabled to preserve financial audit integrity.
              </span>
            </div>
          ) : isOfficer ? (
            <div className="p-3 bg-blue-50/90 border border-blue-200 rounded-xl flex items-center gap-2.5 text-xs text-blue-900">
              <Shield className="w-4 h-4 text-[#0E4EBD] shrink-0" />
              <span>
                <strong>Institutional Record:</strong> This official check voucher was uploaded by SAS / Club Adviser. Student officers have view-only inspection access.
              </span>
            </div>
          ) : null}

          {/* Existing Voucher Meta Banner if already uploaded */}
          {existingVoucher && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  Uploaded by <strong>{existingVoucher.uploadedByName}</strong> ({existingVoucher.uploadedByRole.toUpperCase()}) on{' '}
                  {new Date(existingVoucher.uploadedAt).toLocaleDateString()}
                </span>
              </div>
              <a
                href={existingVoucher.fileUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:underline shrink-0"
              >
                <Eye className="w-3.5 h-3.5" />
                View File
              </a>
            </div>
          )}

          {/* 1. Document File Upload Area */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
              Scanned Disbursement Voucher / Cheque Proof <span className="text-rose-500">*</span>
            </label>

            {fileUrl ? (
              <div className="p-4 bg-slate-50 border-2 border-emerald-500/40 rounded-2xl flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="overflow-hidden">
                    <p className="text-xs font-bold text-slate-900 truncate">{fileName || 'Disbursement-Voucher'}</p>
                    <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                      {fileType.toUpperCase()} • {fileSize ? `${Math.round(fileSize / 1024)} KB` : 'Attached'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 bg-white text-blue-700 hover:bg-blue-50 border border-blue-200 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition-all"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Preview
                  </a>
                  {!isEffectiveReadOnly && (
                    <label className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-semibold cursor-pointer transition-all">
                      Replace
                      <input
                        type="file"
                        accept=".pdf,image/png,image/jpeg,image/webp"
                        onChange={handleFileUpload}
                        className="hidden"
                        disabled={isUploading}
                      />
                    </label>
                  )}
                </div>
              </div>
            ) : isEffectiveReadOnly ? (
              <div className="border-2 border-dashed border-slate-200 rounded-2xl p-6 text-center space-y-2 bg-slate-50">
                <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto" />
                <h4 className="text-xs font-bold text-slate-700">
                  {isSasAdminOnOrgEvent ? 'Organization-Managed Activity (Read Only)' : 'No Disbursement Voucher Attached'}
                </h4>
                <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                  {isSasAdminOnOrgEvent
                    ? 'This activity belongs to a student organization. Official disbursement receipts or vouchers are managed exclusively by the organization adviser and officers.'
                    : 'The official voucher must be uploaded by the Club Adviser once funds are disbursed.'}
                </p>
              </div>
            ) : (
              <label
                className={`border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center cursor-pointer transition-all ${
                  isUploading
                    ? 'border-blue-400 bg-blue-50/50'
                    : 'border-slate-300 hover:border-[#0E4EBD] hover:bg-blue-50/20 bg-slate-50'
                }`}
              >
                <input
                  type="file"
                  accept=".pdf,image/png,image/jpeg,image/webp"
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={isUploading || isEffectiveReadOnly}
                />
                {isUploading ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="w-8 h-8 text-[#0E4EBD] animate-spin" />
                    <span className="text-xs font-bold text-slate-700">{uploadProgress}</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center text-center gap-2">
                    <div className="w-12 h-12 rounded-2xl bg-blue-100 text-[#0E4EBD] flex items-center justify-center">
                      <Upload className="w-6 h-6" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-800">
                        Click to upload or drag & drop Disbursement Voucher
                      </span>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Supports scanned PDF vouchers, bank release slips, or check copies (Max 10 MB)
                      </p>
                    </div>
                  </div>
                )}
              </label>
            )}
          </div>

          {/* 2. Metadata Inputs */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Cheque / Reference Number */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-[#0E4EBD]" />
                  Cheque / Reference Number <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  disabled={isEffectiveReadOnly}
                  value={chequeNumber}
                  onChange={(e) => setChequeNumber(e.target.value)}
                  placeholder="e.g. CHK-2026-98124 or REF-001"
                  className={`w-full px-3.5 py-2 text-xs font-mono font-medium rounded-xl border border-slate-300 outline-none ${
                    isEffectiveReadOnly ? 'bg-slate-100 text-slate-600 cursor-not-allowed' : 'bg-white focus:ring-2 focus:ring-[#0E4EBD]/30 focus:border-[#0E4EBD]'
                  }`}
                />
                <span className="text-[10px] text-slate-400">Printed number on official cheque or voucher</span>
              </div>

              {/* Date Released */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-[#0E4EBD]" />
                  Date Released / Disbursed <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  disabled={isEffectiveReadOnly}
                  max={todayStr}
                  value={disbursementDate}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val > todayStr) {
                      toast.error('Date Released cannot be in the future. Please select today or an earlier date.');
                      setDisbursementDate(todayStr);
                    } else {
                      setDisbursementDate(val);
                    }
                  }}
                  className={`w-full px-3.5 py-2 text-xs rounded-xl border border-slate-300 outline-none font-mono ${
                    isEffectiveReadOnly ? 'bg-slate-100 text-slate-600 cursor-not-allowed' : 'bg-white focus:ring-2 focus:ring-[#0E4EBD]/30 focus:border-[#0E4EBD]'
                  }`}
                />
                <span className="text-[10px] text-slate-400">Future dates banned (Today or earlier only)</span>
              </div>
            </div>

            {/* Auto-Detected Funding Source & Bucket Allocation (No Manual Selection Needed) */}
            {effectiveFundingSource === 'school_budget' ? (
              autoDetectedBuckets.length > 0 ? (
                <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-2xl space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-[#001A4D] uppercase tracking-wider flex items-center gap-1.5">
                      <Landmark className="w-3.5 h-3.5 text-[#0E4EBD]" />
                      {autoDetectedBuckets.length === 1
                        ? 'Auto-Detected Source Bucket'
                        : `Auto-Detected Multi-Bucket Pull (${autoDetectedBuckets.length} Buckets)`}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                      <Check className="w-3 h-3" />
                      Auto-Deduct on Save
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    {autoDetectedBuckets.map((b) => (
                      <div
                        key={b.bucketId}
                        className="flex items-center justify-between gap-2 bg-white px-3 py-2 rounded-xl border border-blue-100 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="font-bold text-[#001A4D] truncate">{b.bucketName}</div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            Available Balance: {formatCurrency(b.availableAmount)}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-[10px] text-slate-500 uppercase font-semibold">
                            Pull Amount
                          </div>
                          <div className="font-mono font-bold text-rose-700">
                            -{formatCurrency(b.allocatedAmount)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <p className="text-[10px] text-slate-600">
                    Detected automatically from the Activity Proposal's source configuration—no manual bucket selection required.
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700">
                    Legacy Proposal Fallback — Select Miscellaneous Fee Bucket
                  </label>
                  <select
                    disabled={isEffectiveReadOnly}
                    value={legacyFallbackBucketId}
                    onChange={(e) => setLegacyFallbackBucketId(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-300 bg-white outline-none disabled:bg-slate-100"
                  >
                    <option value="">-- Select Miscellaneous Fee Particular --</option>
                    {saoEligibleBuckets.map((cb) => (
                      <option key={cb.bucket.id} value={cb.bucket.id}>
                        {cb.bucket.particular} (Available: {formatCurrency(cb.currentAvailable)})
                      </option>
                    ))}
                  </select>
                  <span className="text-[10px] text-slate-500">
                    This legacy proposal has no saved bucket metadata; select a bucket to deduct {formatCurrency(approvedCeiling)}.
                  </span>
                </div>
              )
            ) : (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs text-slate-700">
                <span className="font-semibold">
                  Configured Source:{' '}
                  <strong className="text-[#001A4D]">
                    {effectiveFundingSource === 'student_contributions'
                      ? 'Student Contribution'
                      : effectiveFundingSource === 'organization_funds'
                        ? 'Organization Treasury'
                        : effectiveFundingSource === 'retained_sao_fund'
                          ? 'Retained Student Contribution Bucket'
                          : 'Non-Monetary (₱0.00)'}
                  </strong>
                </span>
                <span className="text-[10px] text-slate-500">Isolated from Misc Fee buckets</span>
              </div>
            )}

            {effectiveFundingSource === 'student_contributions' && (
              <div className="p-3.5 bg-emerald-50/80 border border-emerald-200 rounded-xl space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-emerald-950">Live Student Contribution Cash On Hand</span>
                  <span className="font-black font-mono text-emerald-900">
                    {formatCurrency(contribCashSummary.cashOnHand)}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[11px] text-emerald-900">
                  <div>
                    <span className="text-emerald-700 block">Cashier Collected</span>
                    <strong className="font-mono">{formatCurrency(contribCashSummary.collected)}</strong>
                  </div>
                  <div>
                    <span className="text-emerald-700 block">Applied Retained</span>
                    <strong className="font-mono">{formatCurrency(contribCashSummary.retainedApplied)}</strong>
                  </div>
                  <div>
                    <span className="text-amber-700 block">Uncollected Gap</span>
                    <strong className="font-mono text-amber-900">{formatCurrency(contribCashSummary.uncollected)}</strong>
                  </div>
                </div>
                {approvedCeiling > 0 && contribCashSummary.cashOnHand + 0.009 < approvedCeiling ? (
                  <p className="text-[11px] text-rose-900 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5 font-semibold">
                    Locked until Cashier collections reach proposed budget: Need{' '}
                    <strong>{formatCurrency(Math.max(0, approvedCeiling - contribCashSummary.cashOnHand))}</strong>{' '}
                    more before submitting Disbursement Voucher.
                  </p>
                ) : (
                  <p className="text-[11px] text-emerald-900 bg-emerald-100/70 border border-emerald-300 rounded-lg px-2.5 py-1.5 font-semibold">
                    Total fund reached covers the proposed budget ({formatCurrency(approvedCeiling)}). Disbursement Voucher unlocked!
                  </p>
                )}
              </div>
            )}

            {/* Remarks / Notes */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">
                Remarks / Custodian Notes (Optional)
              </label>
              <input
                type="text"
                disabled={isEffectiveReadOnly}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="e.g. Check claimed by Adviser at Accounting"
                className={`w-full px-3.5 py-2 text-xs rounded-xl border border-slate-300 outline-none ${
                  isEffectiveReadOnly ? 'bg-slate-100 text-slate-600 cursor-not-allowed' : 'bg-white focus:ring-2 focus:ring-[#0E4EBD]/30 focus:border-[#0E4EBD]'
                }`}
              />
              <span className="text-[10px] text-slate-400">Special remarks or release instructions</span>
            </div>
          </div>

          {/* Action Footer */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              {isEffectiveReadOnly ? 'Close' : 'Cancel'}
            </button>

            {!isEffectiveReadOnly && (
              <button
                type="submit"
                disabled={
                  isSaving ||
                  isUploading ||
                  !fileUrl ||
                  (effectiveFundingSource === 'student_contributions' &&
                    approvedCeiling > 0 &&
                    contribCashSummary.cashOnHand + 0.009 < approvedCeiling)
                }
                className="px-5 py-2 bg-[#001A4D] hover:bg-[#002D72] text-[#FFD41C] font-bold rounded-xl text-xs flex items-center gap-2 transition-all shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FileCheck className="w-4 h-4 text-[#FFD41C]" />
                <span>Submit &amp; Attach Voucher</span>
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Submission Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-[#001A4D] text-white px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-400/20 text-[#FFD41C] flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">Confirm Disbursement Submission</h4>
                  <p className="text-[11px] text-blue-200/80">Please verify all details before finalizing</p>
                </div>
              </div>
              <button
                type="button"
                disabled={isSaving}
                onClick={() => setShowConfirmModal(false)}
                className="w-8 h-8 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 flex items-center justify-center cursor-pointer disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-950 flex items-start gap-2">
                <Lock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <span>
                  <strong>Permanent Action:</strong> Once submitted, this Disbursement Voucher is locked and <strong>cannot be edited or removed</strong>.
                </span>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500">Activity</span>
                  <span className="font-bold text-slate-900 text-right truncate">{event.title}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500">Cheque / Ref #</span>
                  <span className="font-mono font-bold text-[#001A4D]">{chequeNumber.trim()}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500">Date Released</span>
                  <span className="font-mono font-semibold text-slate-800">{disbursementDate}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500">Attached File</span>
                  <span className="font-medium text-slate-800 truncate max-w-[200px]">{fileName}</span>
                </div>
                <div className="pt-2 border-t border-slate-200 flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-700">Total Amount Disbursed</span>
                  <span className="font-mono font-black text-sm text-[#001A4D]">
                    {formatCurrency(approvedCeiling)}
                  </span>
                </div>
              </div>

              {effectiveFundingSource === 'school_budget' && autoDetectedBuckets.length > 0 && (
                <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-3 space-y-1.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#001A4D]">
                    Auto-Deducted Bucket Breakdown
                  </div>
                  {autoDetectedBuckets.map((b) => (
                    <div key={b.bucketId} className="flex items-center justify-between text-xs">
                      <span className="text-slate-700 font-medium truncate pr-2">{b.bucketName}</span>
                      <span className="font-mono font-bold text-rose-700 shrink-0">
                        -{formatCurrency(b.allocatedAmount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => setShowConfirmModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                >
                  Review Details
                </button>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={executeConfirmedSave}
                  className="px-4 py-2 bg-[#001A4D] hover:bg-[#002D72] text-[#FFD41C] rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Submitting...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Confirm &amp; Submit</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
