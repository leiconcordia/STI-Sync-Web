/**
 * src/app/signatory/components/LiquidationEndorsementModal.tsx
 *
 * Official Review and Digital Endorsement Studio for Financial Liquidations (Form LF-01).
 * Allows Accountants, Program Heads, Deans, and the School President to review
 * itemized expenses, examine uploaded receipts/invoices, verify budget variance,
 * and stamp their verified black ink electronic signature to advance the endorsement pipeline.
 */

import React, { useState, useMemo } from 'react';
import {
  X,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  DollarSign,
  PenTool,
  Send,
  ShieldCheck,
  Building,
  UserCheck,
  Calendar,
  AlertCircle,
  Eye,
  ExternalLink,
  FileText,
  File,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import type { LiquidationDocument, ExpenseLineItem } from '../../modules/finance/types/liquidation.types';
import {
  endorseLiquidationStep,
  returnLiquidationStep,
} from '../../modules/finance/services/liquidation.service';
import LiquidationSignatoryTracker from '../../modules/finance/components/LiquidationSignatoryTracker';
import { formatCurrency, formatVariance } from '../../utils/currency';
import ReceiptLightboxModal from '../../modules/finance/components/ReceiptLightboxModal';

interface LiquidationEndorsementModalProps {
  isOpen: boolean;
  onClose: () => void;
  liquidation: LiquidationDocument | null;
  signatorySession: any;
  onOpenSignaturePad: () => void;
  onLiquidationUpdated?: () => void;
}

export default function LiquidationEndorsementModal({
  isOpen,
  onClose,
  liquidation,
  signatorySession,
  onOpenSignaturePad,
  onLiquidationUpdated,
}: LiquidationEndorsementModalProps) {
  const [remarks, setRemarks] = useState('');
  const [returnRemarks, setReturnRemarks] = useState('');
  const [isReturning, setIsReturning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lightboxData, setLightboxData] = useState<{
    url: string;
    title: string;
    vendor?: string;
    amount?: number;
    fileName?: string;
    fileType?: string;
  } | null>(null);

  if (!isOpen || !liquidation) return null;

  const userUid = signatorySession?.id || signatorySession?.uid;
  const userEmail = (signatorySession?.email || '').toLowerCase();
  const userRole = signatorySession?.role || '';
  const currentStage = liquidation.currentStageIndex ?? 1;

  const currentStep =
    liquidation.approvalChain?.find((s) => {
      const stageMatch = s.stageIndex ? s.stageIndex === currentStage : true;
      if (!stageMatch) return false;
      if (userUid && s.signatoryUid === userUid) return true;
      if (userEmail && s.signatoryEmail?.toLowerCase() === userEmail) return true;
      if (userRole && s.role === userRole) return true;
      return false;
    }) || liquidation.approvalChain?.[liquidation.currentStepIndex ?? 0];

  const activeSignatureUrl = useMemo(() => {
    if (signatorySession?.signatureUrl) return signatorySession.signatureUrl;
    if (signatorySession?.signatureDataUrl) return signatorySession.signatureDataUrl;
    try {
      const raw = localStorage.getItem('sti_sync_signatory_session') || localStorage.getItem('sti_sync_officer_session');
      if (raw) {
        const parsed = JSON.parse(raw);
        return parsed.signatureUrl || parsed.signatureDataUrl || null;
      }
    } catch {}
    return null;
  }, [signatorySession?.signatureUrl, signatorySession?.signatureDataUrl]);

  const hasSignature = Boolean(activeSignatureUrl);
  const isSchoolAdmin =
    currentStep?.role === 'school_administrator' ||
    signatorySession?.role === 'school_administrator';
  const isPresident =
    currentStep?.role === 'school_president' ||
    signatorySession?.role === 'school_president';
  const isFinalApprover =
    isPresident ||
    isSchoolAdmin ||
    currentStep?.actionType === 'approve' ||
    signatorySession?.actionType === 'approve';

  const isChecker = currentStep?.actionType === 'check' || currentStep?.role === 'accountant';

  const handleEndorse = async (overrideActionType?: 'endorse' | 'approve' | 'check') => {
    if (!hasSignature) {
      toast.error('Please register your electronic signature before endorsing this liquidation.');
      onOpenSignaturePad();
      return;
    }

    const action = overrideActionType || (isFinalApprover ? 'approve' : (isChecker ? 'check' : 'endorse'));

    setIsSubmitting(true);
    try {
      const result = await endorseLiquidationStep(
        liquidation.id,
        {
          uid: signatorySession?.id || signatorySession?.uid || '',
          id: signatorySession?.id || signatorySession?.uid || '',
          name: signatorySession?.name || '',
          email: signatorySession?.email || '',
          roleTitle: signatorySession?.roleTitle || '',
          role: signatorySession?.role || '',
          actionType: action,
          signatureUrl: activeSignatureUrl || undefined,
        },
        remarks
      );

      if (result.isFullyApproved) {
        toast.success(`Liquidation fully approved! Financial ledger and event status updated.`);
      } else if (result.stageAdvanced) {
        toast.success(`Stage ${currentStage} completed! Liquidation forwarded to the next approval stage.`);
      } else {
        toast.success(`Digital signature endorsement recorded successfully.`);
      }

      if (onLiquidationUpdated) onLiquidationUpdated();
      onClose();
    } catch (err: any) {
      console.error('Failed to endorse liquidation:', err);
      toast.error(err?.message || 'Failed to endorse liquidation.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReturn = async () => {
    if (!returnRemarks.trim()) {
      toast.error('Please provide specific feedback/revision remarks before returning.');
      return;
    }

    setIsSubmitting(true);
    try {
      await returnLiquidationStep(
        liquidation.id,
        {
          uid: signatorySession.id || signatorySession.uid,
          name: signatorySession.name,
          email: signatorySession.email,
          roleTitle: signatorySession.roleTitle,
        },
        returnRemarks
      );

      toast.success(`Liquidation returned for revision with your feedback remarks.`);
      if (onLiquidationUpdated) onLiquidationUpdated();
      onClose();
    } catch (err: any) {
      console.error('Failed to return liquidation:', err);
      toast.error(err?.message || 'Failed to return liquidation.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const lineItems: ExpenseLineItem[] = liquidation.lineItems || [];
  const allocatedBudget = liquidation.allocatedBudget || 0;
  const totalActualSpending = liquidation.totalActualSpending || lineItems.reduce((acc, i) => acc + (i.totalCost || 0), 0);
  const surplusOrDeficit = liquidation.surplusOrDeficit ?? (allocatedBudget - totalActualSpending);
  const isDeficit = surplusOrDeficit < 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/75 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-5xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* ── HEADER ── */}
        <div className="bg-[#001A4D] text-white px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#0E4EBD] text-white flex items-center justify-center shadow-md">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-white leading-tight">
                  {isFinalApprover
                    ? 'Executive Review & Presidential Approval'
                    : isChecker
                    ? 'Financial Audit & Liquidation Verification'
                    : 'Review & Institutional Endorsement'}
                </h2>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-blue-400/20 text-blue-200 border border-blue-400/30">
                  Form LF-01
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  Stage {currentStage}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Event Financial Liquidation • {isFinalApprover ? 'Final Executive Decision' : 'Reviewing as'}{' '}
                <strong>{signatorySession?.roleTitle || 'Institutional Signatory'}</strong>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── BODY: SCROLLABLE LIQUIDATION CONTENT ── */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6 text-slate-800">
          {/* Header Card */}
          <div className="pb-5 border-b border-slate-200">
            <span className="text-xs text-slate-400 font-mono uppercase tracking-wider block">
              Financial Liquidation Report
            </span>
            <h1 className="text-2xl font-black text-slate-900 mt-1">{liquidation.eventTitle}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-600">
              <div className="flex items-center gap-1.5">
                <Building className="w-3.5 h-3.5 text-slate-400" />
                <span><strong className="text-slate-700">Organization:</strong> {liquidation.organizationName || 'Student Affairs & Services'}</span>
              </div>
              <div>•</div>
              <div className="flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                <span><strong className="text-slate-700">Submitted By:</strong> {liquidation.createdByName} ({liquidation.createdByRole || 'officer'})</span>
              </div>
            </div>
          </div>

          {/* Financial Variance Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Approved Budget Ceiling</span>
              <span className="text-xl font-black text-[#001A4D] mt-1 block">{formatCurrency(allocatedBudget)}</span>
              <p className="text-[10px] text-slate-400 mt-0.5">Approved Cash Advance / Allocation</p>
            </div>

            <div className="p-4 bg-blue-50/60 border border-blue-200 rounded-2xl">
              <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wider block">Total Actual Spending</span>
              <span className="text-xl font-black text-blue-900 mt-1 block">{formatCurrency(totalActualSpending)}</span>
              <p className="text-[10px] text-blue-600 mt-0.5">{lineItems.length} Itemized expense lines</p>
            </div>

            <div className={`p-4 rounded-2xl border ${isDeficit ? 'bg-rose-50/80 border-rose-300' : 'bg-emerald-50/80 border-emerald-300'}`}>
              <span className={`text-[11px] font-bold uppercase tracking-wider block ${isDeficit ? 'text-rose-700' : 'text-emerald-700'}`}>
                {isDeficit ? 'Net Deficit (Over Budget)' : 'Net Surplus (To Return)'}
              </span>
              <span className={`text-xl font-black mt-1 block ${isDeficit ? 'text-rose-900' : 'text-emerald-900'}`}>
                {formatVariance(surplusOrDeficit)}
              </span>
              <p className={`text-[10px] mt-0.5 ${isDeficit ? 'text-rose-700' : 'text-emerald-700'}`}>
                {isDeficit ? 'Requires ledger deficit deduction' : 'Will be refunded to organization funds'}
              </p>
            </div>
          </div>

          {/* Itemized Expenses Table */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-[#001A4D] flex items-center justify-between">
              <span>Itemized Expenses & Verified Receipts ({lineItems.length})</span>
            </h3>

            <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-xs">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 font-bold text-slate-700">
                    <th className="p-3">#</th>
                    <th className="p-3">Item Description</th>
                    <th className="p-3">Category</th>
                    <th className="p-3 text-right">Qty</th>
                    <th className="p-3 text-right">Unit Cost</th>
                    <th className="p-3 text-right">Total Cost</th>
                    <th className="p-3">Vendor / Invoice</th>
                    <th className="p-3 text-center">Receipt Evidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lineItems.map((item, idx) => {
                    const files = item.receiptFiles || [];
                    const hasReceipt = files.length > 0 || Boolean(item.receiptUrl);

                    return (
                      <tr key={item.id || idx} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3 font-mono text-slate-400 font-bold">{idx + 1}</td>
                        <td className="p-3">
                          <div className="font-bold text-slate-900">{item.description}</div>
                          {item.allocatedCost !== undefined && item.allocatedCost > 0 && (
                            <div className="text-[10px] text-slate-500 mt-0.5">
                              Baseline: {formatCurrency(item.allocatedCost)}
                            </div>
                          )}
                        </td>
                        <td className="p-3 text-slate-600">
                          <span className="px-2 py-0.5 bg-slate-100 rounded text-[10px] font-semibold border border-slate-200">
                            {item.category}
                          </span>
                        </td>
                        <td className="p-3 text-right font-semibold">{item.quantity}</td>
                        <td className="p-3 text-right font-medium">{formatCurrency(item.unitCost)}</td>
                        <td className="p-3 text-right font-bold text-[#001A4D]">{formatCurrency(item.totalCost)}</td>
                        <td className="p-3">
                          <div className="font-medium text-slate-800">{item.vendorName || '—'}</div>
                          {item.receiptNumber && (
                            <div className="text-[10px] font-mono text-slate-400">Ref: {item.receiptNumber}</div>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          {files.length > 0 ? (
                            <div className="flex items-center justify-center gap-1.5 flex-wrap">
                              {files.map((file, fIdx) => (
                                <button
                                  key={file.id || fIdx}
                                  type="button"
                                  onClick={() =>
                                    setLightboxData({
                                      url: file.url,
                                      title: item.description,
                                      vendor: item.vendorName,
                                      amount: item.totalCost,
                                      fileName: file.name,
                                      fileType: file.fileType,
                                    })
                                  }
                                  className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-[10px] font-semibold flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                                  title={`View ${file.name}`}
                                >
                                  <Eye className="w-3 h-3 text-blue-600" />
                                  <span>Receipt {fIdx + 1}</span>
                                </button>
                              ))}
                            </div>
                          ) : item.receiptUrl ? (
                            <button
                              type="button"
                              onClick={() =>
                                setLightboxData({
                                  url: item.receiptUrl!,
                                  title: item.description,
                                  vendor: item.vendorName,
                                  amount: item.totalCost,
                                })
                              }
                              className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-[10px] font-semibold flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                            >
                              <Eye className="w-3 h-3 text-blue-600" />
                              <span>View Receipt</span>
                            </button>
                          ) : (
                            <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                              No Receipt
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Visual Signatory Tracker */}
          <div className="space-y-3 pt-4 border-t border-slate-200">
            <h3 className="text-sm font-bold text-[#001A4D] flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#0E4EBD]" />
              <span>Multi-Stage Approval Pipeline Progress</span>
            </h3>
            <LiquidationSignatoryTracker
              approvalChain={liquidation.approvalChain}
              currentStageIndex={liquidation.currentStageIndex ?? 1}
              liquidationStatus={liquidation.status}
            />
          </div>

          {/* ── SIGNATURE STAMPING & VERIFICATION SECTION ── */}
          <div className="pt-4 border-t border-slate-200 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <PenTool className="w-4 h-4 text-[#0E4EBD]" />
              <span>Signatory Electronic Signature Verification</span>
            </h3>

            {hasSignature ? (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="border border-slate-300 bg-white p-2 rounded-xl shadow-xs">
                    <img
                      src={activeSignatureUrl!}
                      alt="Registered E-Signature"
                      className="h-10 w-28 object-contain"
                    />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Verified Digital Ink Signature Ready</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Stamping as <strong>{signatorySession.name}</strong> ({signatorySession.roleTitle})
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onOpenSignaturePad}
                  className="text-xs text-blue-700 hover:text-blue-800 font-semibold underline self-start sm:self-center cursor-pointer"
                >
                  Re-draw Signature
                </button>
              </div>
            ) : (
              <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-700" />
                  <div>
                    <h4 className="text-xs font-bold text-amber-950">No Electronic Signature on File</h4>
                    <p className="text-[11px] text-amber-800 mt-0.5">
                      Please register your digital black ink signature before endorsing this liquidation.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onOpenSignaturePad}
                  className="px-3.5 py-1.5 bg-[#001A4D] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <PenTool className="w-3.5 h-3.5 text-[#FFD41C]" />
                  <span>Register Signature</span>
                </button>
              </div>
            )}

            {/* Endorsement Remarks */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {isFinalApprover
                  ? 'Executive Approval Directives / Remarks (Optional)'
                  : isChecker
                  ? 'Audit Verification Notes (Optional)'
                  : 'Endorsement Notes (Optional)'}
              </label>
              <input
                type="text"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder={
                  isFinalApprover
                    ? 'e.g. Approved. Proceed with ledger posting and remaining cash refund...'
                    : isChecker
                    ? 'e.g. Receipts audited and verified against expense line items...'
                    : 'e.g. Verified by department head. Recommended for approval...'
                }
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
              />
            </div>

            {/* Return Mode Dialog */}
            {isReturning && (
              <div className="p-4 bg-amber-50/80 border border-amber-300 rounded-2xl space-y-2">
                <label className="block text-xs font-bold text-amber-950 flex items-center gap-1.5">
                  <RotateCcw className="w-3.5 h-3.5 text-amber-700" />
                  <span>Return Feedback Remarks (Required)</span>
                </label>
                <textarea
                  rows={3}
                  value={returnRemarks}
                  onChange={(e) => setReturnRemarks(e.target.value)}
                  placeholder="Detail the discrepancies or missing receipts (e.g. upload clear OR for Catering, explain surplus discrepancy)..."
                  className="w-full px-3 py-2 bg-white border border-amber-300 rounded-xl text-xs outline-none focus:ring-2 focus:ring-amber-500/30"
                />
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsReturning(false)}
                    className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleReturn}
                    disabled={isSubmitting || !returnRemarks.trim()}
                    className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg shadow-xs disabled:opacity-50 cursor-pointer"
                  >
                    {isSubmitting ? 'Returning...' : 'Confirm Return for Revision'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── FOOTER ACTIONS ── */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            {!isReturning && (
              <button
                type="button"
                onClick={() => setIsReturning(true)}
                disabled={isSubmitting}
                className="text-xs text-amber-700 hover:text-amber-800 font-bold flex items-center gap-1.5 px-3 py-2 rounded-xl hover:bg-amber-100/50 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Return for Revision</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
            >
              Close
            </button>

            {isSchoolAdmin ? (
              <>
                <button
                  type="button"
                  onClick={() => handleEndorse('endorse')}
                  disabled={isSubmitting || !hasSignature}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-all disabled:opacity-50 cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  <span>{isSubmitting ? 'Processing...' : 'Endorse & Forward to President'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleEndorse('approve')}
                  disabled={isSubmitting || !hasSignature}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 bg-[#001A4D] hover:bg-[#0A2E6D] text-[#FFD41C] border border-[#FFD41C]/40 shadow-blue-900/25 ring-2 ring-[#FFD41C]/30 transition-all disabled:opacity-50 cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4 text-[#FFD41C]" />
                  <span>{isSubmitting ? 'Processing...' : 'Authorize & Approve (Final)'}</span>
                </button>
              </>
            ) : isPresident ? (
              <button
                type="button"
                onClick={() => handleEndorse('approve')}
                disabled={isSubmitting || !hasSignature}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 bg-[#001A4D] hover:bg-[#0A2E6D] text-[#FFD41C] border border-[#FFD41C]/40 shadow-blue-900/25 ring-2 ring-[#FFD41C]/30 transition-all disabled:opacity-50 cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4 text-[#FFD41C]" />
                <span>{isSubmitting ? 'Processing...' : 'Authorize & Approve Financial Liquidation (Presidential Final)'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleEndorse(isChecker ? 'check' : 'endorse')}
                disabled={isSubmitting || !hasSignature}
                className={`w-full sm:w-auto px-6 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-50 cursor-pointer ${
                  isChecker
                    ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-600/20'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20'
                }`}
              >
                <Send className="w-4 h-4" />
                <span>
                  {isSubmitting
                    ? 'Processing...'
                    : isChecker
                    ? 'Audit & Endorse Liquidation'
                    : 'Stamp E-Signature & Endorse Liquidation'}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Lightbox / Document Viewer */}
      {lightboxData && (
        <ReceiptLightboxModal
          isOpen={!!lightboxData}
          onClose={() => setLightboxData(null)}
          imageUrl={lightboxData.url}
          itemTitle={lightboxData.title}
          vendorName={lightboxData.vendor}
          amount={lightboxData.amount}
          fileName={lightboxData.fileName}
          fileType={lightboxData.fileType}
        />
      )}
    </div>
  );
}
