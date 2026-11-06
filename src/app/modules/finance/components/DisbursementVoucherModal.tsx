import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Upload,
  FileText,
  FileCheck,
  CheckCircle2,
  Trash2,
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
import { uploadToCloudinary } from '../../../../services/cloudinary';
import { saveEventDisbursementVoucher, removeEventDisbursementVoucher } from '../../events/services/event.service';
import type { EventDocument } from '../../events/types/event.types';
import type { DisbursementVoucherAttachment } from '../types/liquidation.types';
import { formatCurrency } from '../../../utils/currency';
import { toast } from 'sonner';

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
  const isOfficer = (userRole === 'officer' || userProfile?.role === 'officer') && !userProfile?.isAdviser;
  const normalizedStatus = (liquidationStatus || (event as any)?.liquidationStatus || '').toString().toLowerCase().trim();
  const isSubmittedOrApproved =
    normalizedStatus === 'under_review' ||
    normalizedStatus === 'pending' ||
    normalizedStatus === 'approved' ||
    normalizedStatus === 'submitted';

  const isLockedByLiquidation = Boolean(existingVoucher?.fileUrl) && isSubmittedOrApproved;
  const isEffectiveReadOnly = Boolean(readOnly || isOfficer || isLockedByLiquidation);

  const [fileUrl, setFileUrl] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [fileType, setFileType] = useState<'image' | 'pdf' | 'document' | 'other'>('image');
  const [fileSize, setFileSize] = useState<number | undefined>(undefined);
  const [publicId, setPublicId] = useState<string | undefined>(undefined);

  const [chequeNumber, setChequeNumber] = useState<string>('');
  const [disbursementDate, setDisbursementDate] = useState<string>('');
  const [remarks, setRemarks] = useState<string>('');

  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Initialize or reset form when modal opens or event changes
  useEffect(() => {
    if (!isOpen) return;

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

  const handleSave = async (e: React.FormEvent) => {
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

    setIsSaving(true);
    try {
      const uploaderName =
        userProfile?.fullName ||
        userProfile?.displayName ||
        userProfile?.name ||
        (userRole === 'admin' ? 'SAS Administrator' : 'Club Adviser');

      const uploaderRole: 'adviser' | 'admin' = userRole === 'admin' ? 'admin' : 'adviser';

      const approvedCeiling = Number(
        existingVoucher?.amountDisbursed ||
        event.totalApprovedBudget ||
        (event as any).allocatedBudget ||
        (event as any).approvedBudget ||
        0
      );

      const payload: DisbursementVoucherAttachment = {
        fileUrl,
        fileName: fileName || 'Disbursement-Voucher',
        fileType,
        fileSize,
        publicId,
        chequeNumber: chequeNumber.trim(),
        disbursementDate,
        amountDisbursed: approvedCeiling,
        remarks: remarks.trim(),
        uploadedBy: userProfile?.uid || 'system',
        uploadedByName: uploaderName,
        uploadedByRole: uploaderRole,
        uploadedAt: new Date().toISOString(),
      };

      await saveEventDisbursementVoucher(event.id, payload);
      toast.success('Official Disbursement Voucher attached and verified!');
      onVoucherSaved?.(payload);
      onClose();
    } catch (err: any) {
      console.error('[DisbursementVoucherModal] Save error:', err);
      toast.error(err?.message || 'Failed to save Disbursement Voucher.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (isEffectiveReadOnly) return;

    if (!window.confirm('Are you sure you want to remove this Disbursement Voucher? This will re-lock Cash Custodians and Financial Liquidation.')) {
      return;
    }

    setIsDeleting(true);
    try {
      const actorName = userProfile?.fullName || userProfile?.displayName || 'User';
      await removeEventDisbursementVoucher(event.id, actorName, userRole);
      toast.info('Disbursement Voucher removed.');
      onVoucherRemoved?.();
      onClose();
    } catch (err: any) {
      console.error('[DisbursementVoucherModal] Delete error:', err);
      toast.error(err?.message || 'Failed to remove Disbursement Voucher.');
    } finally {
      setIsDeleting(false);
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
                {isEffectiveReadOnly ? (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 inline-flex items-center gap-1">
                    <Lock className="w-2.5 h-2.5" /> View Only
                  </span>
                ) : existingVoucher ? (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                    Attached
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
                <h4 className="text-xs font-bold text-slate-700">No Disbursement Voucher Attached</h4>
                <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                  The official voucher must be uploaded by the Club Adviser or SAS Administration once funds are disbursed.
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
          <div className="pt-4 border-t border-slate-200 flex items-center justify-between gap-3">
            {!isEffectiveReadOnly && existingVoucher ? (
              <button
                type="button"
                disabled={isDeleting || isSaving}
                onClick={handleDelete}
                className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeleting ? 'Removing...' : 'Remove Voucher'}</span>
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
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
                  disabled={isSaving || isUploading || !fileUrl}
                  className="px-5 py-2 bg-[#001A4D] hover:bg-[#002D72] text-[#FFD41C] font-bold rounded-xl text-xs flex items-center gap-2 transition-all shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Saving Voucher...</span>
                    </>
                  ) : (
                    <>
                      <FileCheck className="w-4 h-4 text-[#FFD41C]" />
                      <span>{existingVoucher ? 'Update Voucher' : 'Save & Attach Voucher'}</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
