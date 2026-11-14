import React, { useMemo, useState } from 'react';
import {
  X,
  Paperclip,
  FileCheck,
  FileText,
  ExternalLink,
  ZoomIn,
  ZoomOut,
  Camera,
  ShieldCheck,
} from 'lucide-react';
import type { DisbursementVoucherAttachment, LiquidationDocument } from '../../modules/finance/types/liquidation.types';
import { formatCurrency } from '../../utils/currency';
import { formatLongDate, formatLongDateTime } from '../../utils/date';

export interface PARConsolidatedAttachmentItem {
  id: string;
  name: string;
  url: string;
  category: string;
  fileType?: string;
}

interface PARDocumentsAndVoucherModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventTitle: string;
  linkedLiquidation: LiquidationDocument | null;
  attachments: PARConsolidatedAttachmentItem[];
}

interface PreviewEntry {
  id: string;
  name: string;
  url: string;
  category: string;
  fileType?: string;
  isVoucher?: boolean;
  voucherMeta?: DisbursementVoucherAttachment;
}

function isPdfUrl(url: string, fileType?: string): boolean {
  return fileType === 'pdf' || /\.pdf(\?|#|$)/i.test(url);
}

function isImageUrl(url: string, fileType?: string, name?: string): boolean {
  if (fileType === 'image') return true;
  if (/^data:image\//i.test(url)) return true;
  return /\.(png|jpe?g|webp|gif|bmp|svg)(\?|#|$)/i.test(`${url} ${name || ''}`);
}

export default function PARDocumentsAndVoucherModal({
  isOpen,
  onClose,
  eventTitle,
  linkedLiquidation,
  attachments,
}: PARDocumentsAndVoucherModalProps) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [zoom, setZoom] = useState(1);

  const voucher: DisbursementVoucherAttachment | null =
    (linkedLiquidation as any)?.disbursementVoucher || (linkedLiquidation as any)?.voucher || null;

  const allEntries: PreviewEntry[] = useMemo(() => {
    const list: PreviewEntry[] = [];
    if (voucher?.fileUrl) {
      list.push({
        id: 'disbursement-voucher',
        name: voucher.fileName || 'Disbursement Voucher',
        url: voucher.fileUrl,
        category: 'Disbursement Voucher',
        fileType: voucher.fileType,
        isVoucher: true,
        voucherMeta: voucher,
      });
    }

    (linkedLiquidation?.cashierSettlementProofs || []).forEach((p, idx) => {
      list.push({
        id: p.id || `cashier-proof-${idx}`,
        name: p.name || `Cashier Settlement Proof ${idx + 1}`,
        url: p.url,
        category: 'Cashier Settlement Proof',
        fileType: p.fileType,
      });
    });

    attachments.forEach((att) => {
      list.push({
        id: att.id,
        name: att.name,
        url: att.url,
        category: att.category,
        fileType: att.fileType,
      });
    });

    return list;
  }, [voucher, linkedLiquidation, attachments]);

  if (!isOpen) return null;

  const activeEntry = allEntries[selectedIdx] || allEntries[0] || null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-5 bg-slate-950/75 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-6xl h-[88vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-[#001A4D] to-[#0E4EBD] px-5 py-4 text-white flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center border border-white/20 shrink-0">
              <Paperclip className="w-5 h-5 text-[#FFD41C]" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-widest text-blue-200 block">
                Disbursement Voucher &amp; Attached Documents ({allEntries.length})
              </span>
              <h3 className="text-base font-black truncate">{eventTitle}</h3>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-white/75 hover:text-white hover:bg-white/10 cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Split */}
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
          {/* Left: Voucher Details + Document List */}
          <div className="lg:col-span-5 border-b lg:border-b-0 lg:border-r border-slate-200 overflow-y-auto p-4 space-y-4 bg-white">
            {/* Disbursement Voucher Metadata Summary */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold uppercase tracking-wider text-[#001A4D] flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-[#0E4EBD]" />
                  Disbursement Voucher Info
                </span>
                {voucher?.fileUrl ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                    Attached
                  </span>
                ) : (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">
                    Not Attached
                  </span>
                )}
              </div>

              {voucher || linkedLiquidation?.chequeNumber || linkedLiquidation?.orNumber ? (
                <div className="grid grid-cols-2 gap-2 pt-1 text-[11px]">
                  <div>
                    <span className="text-slate-400 block">Cheque / Ref No.</span>
                    <strong className="text-slate-800">
                      {voucher?.chequeNumber || linkedLiquidation?.chequeNumber || '—'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Amount Disbursed</span>
                    <strong className="text-slate-800">
                      {voucher?.amountDisbursed !== undefined
                        ? formatCurrency(voucher.amountDisbursed)
                        : linkedLiquidation?.amountAdvanced !== undefined
                        ? formatCurrency(linkedLiquidation.amountAdvanced)
                        : '—'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Disbursement Date</span>
                    <strong className="text-slate-800">
                      {formatLongDate(voucher?.disbursementDate || linkedLiquidation?.dateReleased, '—')}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">OR Number</span>
                    <strong className="text-slate-800">{linkedLiquidation?.orNumber || '—'}</strong>
                  </div>
                  {voucher?.uploadedByName && (
                    <div className="col-span-2">
                      <span className="text-slate-400 block">Uploaded By</span>
                      <strong className="text-slate-800">
                        {voucher.uploadedByName}
                        {voucher.uploadedAt ? ` (${formatLongDateTime(voucher.uploadedAt)})` : ''}
                      </strong>
                    </div>
                  )}
                  {voucher?.remarks && (
                    <div className="col-span-2">
                      <span className="text-slate-400 block">Remarks</span>
                      <p className="text-slate-700">{voucher.remarks}</p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-[11px] text-slate-500">
                  No disbursement voucher record is linked to this activity.
                </p>
              )}
            </div>

            {/* All Documents List */}
            <div className="space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block">
                Attached Documents ({allEntries.length})
              </span>

              {allEntries.length === 0 ? (
                <div className="p-6 rounded-xl bg-slate-50 border border-dashed border-slate-200 text-center text-xs text-slate-500">
                  No disbursement voucher or supporting documents attached.
                </div>
              ) : (
                <div className="space-y-2">
                  {allEntries.map((entry, idx) => {
                    const isSelected = idx === selectedIdx;
                    const isImg = isImageUrl(entry.url, entry.fileType, entry.name);
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => {
                          setSelectedIdx(idx);
                          setZoom(1);
                        }}
                        className={`w-full text-left p-2.5 rounded-xl border flex items-center justify-between gap-2 transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-blue-50/80 border-[#0E4EBD] ring-1 ring-[#0E4EBD]/20'
                            : 'bg-white border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <div className="min-w-0 flex items-center gap-2.5">
                          <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                              entry.isVoucher
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                : 'bg-blue-50 border-blue-200 text-[#0E4EBD]'
                            }`}
                          >
                            {entry.isVoucher ? (
                              <FileCheck className="w-4 h-4" />
                            ) : isImg ? (
                              <Camera className="w-4 h-4" />
                            ) : (
                              <FileText className="w-4 h-4" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-900 truncate">{entry.name}</p>
                            <span className="text-[10px] font-bold uppercase tracking-wide text-blue-700">
                              {entry.category}
                            </span>
                          </div>
                        </div>
                        <a
                          href={entry.url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 shrink-0"
                          title="Open in new tab"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right: Inline Previewer */}
          <div className="lg:col-span-7 flex flex-col bg-slate-900 text-white min-h-[280px] overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-800 border-b border-slate-700 flex items-center justify-between gap-2 text-xs shrink-0">
              <div className="min-w-0">
                <span className="text-[10px] uppercase tracking-wider text-slate-400 block">
                  {activeEntry?.category || 'Document Preview'}
                </span>
                <p className="font-bold truncate">{activeEntry?.name || 'No Document Selected'}</p>
              </div>
              {activeEntry && (
                <div className="flex items-center gap-1.5 shrink-0">
                  {isImageUrl(activeEntry.url, activeEntry.fileType, activeEntry.name) && (
                    <>
                      <button
                        type="button"
                        onClick={() => setZoom((z) => Math.max(0.75, Number((z - 0.25).toFixed(2))))}
                        className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 cursor-pointer"
                        title="Zoom Out"
                      >
                        <ZoomOut className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setZoom((z) => Math.min(2.5, Number((z + 0.25).toFixed(2))))}
                        className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 cursor-pointer"
                        title="Zoom In"
                      >
                        <ZoomIn className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                  <a
                    href={activeEntry.url}
                    target="_blank"
                    rel="noreferrer"
                    className="px-2.5 py-1 rounded-lg bg-[#0E4EBD] hover:bg-blue-600 text-white font-semibold inline-flex items-center gap-1"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open Original</span>
                  </a>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-slate-950">
              {!activeEntry ? (
                <div className="text-center text-slate-400 text-xs space-y-2">
                  <FileText className="w-10 h-10 mx-auto text-slate-600" />
                  <p>Select a voucher or attached document to preview.</p>
                </div>
              ) : isPdfUrl(activeEntry.url, activeEntry.fileType) ? (
                <iframe
                  src={activeEntry.url}
                  title={activeEntry.name}
                  className="w-full h-full min-h-[380px] rounded-lg bg-white"
                />
              ) : isImageUrl(activeEntry.url, activeEntry.fileType, activeEntry.name) ? (
                <img
                  src={activeEntry.url}
                  alt={activeEntry.name}
                  style={{ transform: `scale(${zoom})` }}
                  className="max-h-full max-w-full object-contain rounded-lg transition-transform duration-150"
                />
              ) : (
                <div className="text-center space-y-3 text-xs text-slate-300">
                  <FileText className="w-12 h-12 mx-auto text-slate-500" />
                  <p>Preview is not supported inline for this file format.</p>
                  <a
                    href={activeEntry.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0E4EBD] hover:bg-blue-600 text-white font-bold"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>Open / Download File</span>
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
