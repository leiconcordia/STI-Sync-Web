import React, { useMemo, useState } from 'react';
import {
  X,
  DollarSign,
  Receipt,
  FileText,
  ExternalLink,
  ZoomIn,
  ZoomOut,
  Paperclip,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
} from 'lucide-react';
import type { LiquidationDocument, ExpenseLineItem, ReceiptAttachment } from '../../modules/finance/types/liquidation.types';
import type { PARAttachmentFile } from '../../modules/post-activity-reports/types/par.types';
import { formatCurrency, formatVariance } from '../../utils/currency';

interface PARFinancialReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventTitle: string;
  totalRevenue: number;
  totalDisbursed: number;
  parLineItems: Array<{ description: string; unitAmount: number; totalAmount: number }>;
  parFinancialAttachments?: PARAttachmentFile[];
  linkedLiquidation: LiquidationDocument | null;
  copiedFromLiquidation?: boolean;
}

interface NormalizedExpenseRow {
  id: string;
  description: string;
  category: string;
  vendorName: string;
  receiptNumber: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  receipts: ReceiptAttachment[];
  isLostReceipt?: boolean;
  lostReceiptReason?: string;
}

function normalizeReceipts(item?: ExpenseLineItem): ReceiptAttachment[] {
  if (!item) return [];
  if (Array.isArray(item.receiptFiles) && item.receiptFiles.length > 0) {
    return item.receiptFiles;
  }
  if (Array.isArray(item.receiptUrls) && item.receiptUrls.length > 0) {
    return item.receiptUrls.map((url, idx) => ({
      id: `url-rec-${idx}`,
      url,
      name: `Receipt ${idx + 1}`,
      fileType: url.toLowerCase().includes('.pdf') ? 'pdf' : 'image',
    }));
  }
  if (item.receiptUrl) {
    return [
      {
        id: 'legacy-rec-0',
        url: item.receiptUrl,
        name: 'Official Receipt',
        fileType: item.receiptUrl.toLowerCase().includes('.pdf') ? 'pdf' : 'image',
      },
    ];
  }
  return [];
}

function isPdfFile(url: string, fileType?: string): boolean {
  return fileType === 'pdf' || /\.pdf(\?|#|$)/i.test(url);
}

export default function PARFinancialReportModal({
  isOpen,
  onClose,
  eventTitle,
  totalRevenue,
  totalDisbursed,
  parLineItems,
  parFinancialAttachments = [],
  linkedLiquidation,
  copiedFromLiquidation,
}: PARFinancialReportModalProps) {
  const [selectedRowIdx, setSelectedRowIdx] = useState(0);
  const [activeReceiptIdx, setActiveReceiptIdx] = useState(0);
  const [zoom, setZoom] = useState(1);

  const expenseRows: NormalizedExpenseRow[] = useMemo(() => {
    if (linkedLiquidation && Array.isArray(linkedLiquidation.lineItems) && linkedLiquidation.lineItems.length > 0) {
      return linkedLiquidation.lineItems.map((li, idx) => ({
        id: li.id || `fl-item-${idx}`,
        description: li.description || li.category || `Expense Item ${idx + 1}`,
        category: li.category || 'General',
        vendorName: li.vendorName || '—',
        receiptNumber: li.receiptNumber || '—',
        quantity: Number(li.quantity || 1),
        unitCost: Number(li.unitCost || 0),
        totalCost: Number(li.totalCost || 0),
        receipts: normalizeReceipts(li),
        isLostReceipt: Boolean(li.isLostReceipt),
        lostReceiptReason: li.lostReceiptReason || '',
      }));
    }

    return parLineItems.map((li, idx) => ({
      id: `par-item-${idx}`,
      description: li.description || `Expense Item ${idx + 1}`,
      category: 'PAR Summary Item',
      vendorName: '—',
      receiptNumber: '—',
      quantity: 1,
      unitCost: Number(li.unitAmount || 0),
      totalCost: Number(li.totalAmount || 0),
      receipts: [],
    }));
  }, [linkedLiquidation, parLineItems]);

  const extraAttachments: ReceiptAttachment[] = useMemo(() => {
    const extras: ReceiptAttachment[] = [];
    (linkedLiquidation?.cashierSettlementProofs || []).forEach((p, idx) => {
      extras.push({
        ...p,
        id: p.id || `cashier-proof-${idx}`,
        name: `Settlement Proof: ${p.name || `#${idx + 1}`}`,
      });
    });
    parFinancialAttachments.forEach((f, idx) => {
      extras.push({
        id: f.id || `par-fin-${idx}`,
        url: f.url,
        name: `PAR Attachment: ${f.name || `#${idx + 1}`}`,
        fileType: (f.fileType as any) || (isPdfFile(f.url) ? 'pdf' : 'image'),
      });
    });
    return extras;
  }, [linkedLiquidation, parFinancialAttachments]);

  if (!isOpen) return null;

  const netBalance = totalRevenue - totalDisbursed;
  const selectedRow = expenseRows[selectedRowIdx] || null;
  const activeReceipts = selectedRow?.receipts.length
    ? selectedRow.receipts
    : extraAttachments;
  const activeFile = activeReceipts[activeReceiptIdx] || activeReceipts[0] || null;
  const totalReceiptCount = expenseRows.reduce((sum, r) => sum + r.receipts.length, 0) + extraAttachments.length;

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
              <DollarSign className="w-5 h-5 text-[#FFD41C]" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-bold uppercase tracking-widest text-blue-200">
                  Financial Report &amp; Receipts
                </span>
                {(linkedLiquidation?.referenceNumber || linkedLiquidation?.referenceNo) && (
                  <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-white/15 text-emerald-200">
                    {linkedLiquidation.referenceNumber || linkedLiquidation.referenceNo}
                  </span>
                )}
              </div>
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

        {/* Summary KPI Bar */}
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs shrink-0">
          <div className="bg-white p-2.5 rounded-xl border border-slate-200">
            <span className="text-[10px] text-slate-500 block">Revenue / Budget</span>
            <strong className="text-sm font-black text-slate-900">{formatCurrency(totalRevenue)}</strong>
          </div>
          <div className="bg-white p-2.5 rounded-xl border border-slate-200">
            <span className="text-[10px] text-slate-500 block">Total Expenses</span>
            <strong className="text-sm font-black text-slate-900">{formatCurrency(totalDisbursed)}</strong>
          </div>
          <div
            className={`p-2.5 rounded-xl border ${
              netBalance >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'
            }`}
          >
            <span className={`text-[10px] font-semibold block ${netBalance >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
              Balance (Revenue less Expenses)
            </span>
            <strong className={`text-sm font-black ${netBalance >= 0 ? 'text-emerald-900' : 'text-rose-900'}`}>
              {formatVariance(netBalance)}
            </strong>
          </div>
          <div className="bg-white p-2.5 rounded-xl border border-slate-200 flex flex-col justify-center">
            <span className="text-[10px] text-slate-500 block">Attached Receipts &amp; Files</span>
            <strong className="text-sm font-black text-[#0E4EBD] flex items-center gap-1">
              <Receipt className="w-3.5 h-3.5" />
              <span>{totalReceiptCount} file(s)</span>
            </strong>
          </div>
        </div>

        {/* Split Content: Left = Expense Line Items, Right = Receipt Viewer */}
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
          {/* Left: Expense Items List */}
          <div className="lg:col-span-6 border-b lg:border-b-0 lg:border-r border-slate-200 overflow-y-auto p-4 space-y-2.5 bg-white">
            <div className="flex items-center justify-between text-xs pb-1">
              <span className="font-bold uppercase tracking-wider text-slate-700">
                Expense Line Items ({expenseRows.length})
              </span>
              <span className="text-[11px] text-slate-500">
                {copiedFromLiquidation || linkedLiquidation ? 'Cleared Liquidation Data' : 'Proposal Fallback'}
              </span>
            </div>

            {expenseRows.length === 0 ? (
              <div className="p-6 rounded-xl bg-slate-50 border border-dashed border-slate-200 text-center text-xs text-slate-500">
                No itemized expenses recorded for this activity.
              </div>
            ) : (
              expenseRows.map((item, idx) => {
                const isSelected = idx === selectedRowIdx;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setSelectedRowIdx(idx);
                      setActiveReceiptIdx(0);
                      setZoom(1);
                    }}
                    className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50/70 border-[#0E4EBD] shadow-xs ring-1 ring-[#0E4EBD]/20'
                        : 'bg-slate-50/60 border-slate-200 hover:bg-slate-100/70'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-xs font-bold text-slate-900">{item.description}</p>
                          {item.isLostReceipt && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 font-bold text-[10px]">
                              <AlertTriangle className="w-3 h-3 text-amber-700" />
                              Lost Receipt
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {item.category}
                          {item.vendorName !== '—' ? ` • Vendor: ${item.vendorName}` : ''}
                          {item.receiptNumber !== '—' ? ` • OR#: ${item.receiptNumber}` : ''}
                        </p>
                      </div>
                      <span className="text-xs font-black text-slate-900 shrink-0">
                        {formatCurrency(item.totalCost)}
                      </span>
                    </div>

                    {item.isLostReceipt && item.lostReceiptReason && (
                      <div className="mt-1.5 px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-950 leading-snug">
                        <strong className="text-amber-900">Lost Receipt Reason:</strong> {item.lostReceiptReason}
                      </div>
                    )}

                    <div className="mt-2 flex items-center justify-between text-[11px]">
                      <span className="text-slate-500">
                        Qty {item.quantity} × {formatCurrency(item.unitCost)}
                      </span>
                      {item.receipts.length > 0 ? (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold text-[10px] ${
                            item.isLostReceipt
                              ? 'bg-amber-100 text-amber-900 border border-amber-300'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          {item.isLostReceipt
                            ? `${item.receipts.length} Affidavit / Proof${item.receipts.length > 1 ? 's' : ''}`
                            : `${item.receipts.length} Receipt${item.receipts.length > 1 ? 's' : ''}`}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 font-semibold text-[10px]">
                          <AlertCircle className="w-3 h-3" />
                          No receipt file
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}

            {extraAttachments.length > 0 && (
              <div className="pt-3 border-t border-slate-200 space-y-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                  Additional Financial &amp; Settlement Proofs ({extraAttachments.length})
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {extraAttachments.map((file, i) => (
                    <a
                      key={file.id || i}
                      href={file.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-[11px] font-semibold"
                    >
                      <Paperclip className="w-3 h-3" />
                      <span className="truncate max-w-[200px]">{file.name}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: Receipt Previewer */}
          <div className="lg:col-span-6 flex flex-col bg-slate-900 text-white min-h-[280px] overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-800 border-b border-slate-700 flex items-center justify-between gap-2 text-xs shrink-0">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wider text-slate-400">
                    {selectedRow?.isLostReceipt ? 'Substitute Proof Preview' : 'Receipt Preview'}
                  </span>
                  {selectedRow?.isLostReceipt && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold text-[10px]">
                      <AlertTriangle className="w-3 h-3" />
                      Flagged: Lost Receipt
                    </span>
                  )}
                </div>
                <p className="font-bold truncate text-white">
                  {activeFile ? activeFile.name : selectedRow?.description || 'No Receipt Selected'}
                </p>
              </div>
              {activeFile && (
                <div className="flex items-center gap-1.5 shrink-0">
                  {!isPdfFile(activeFile.url, activeFile.fileType) && (
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
                    href={activeFile.url}
                    target="_blank"
                    rel="noreferrer"
                    className="px-2.5 py-1 rounded-lg bg-[#0E4EBD] hover:bg-blue-600 text-white font-semibold inline-flex items-center gap-1"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open</span>
                  </a>
                </div>
              )}
            </div>

            {activeReceipts.length > 1 && (
              <div className="px-4 py-2 bg-slate-800/60 border-b border-slate-700 flex items-center gap-1.5 overflow-x-auto shrink-0">
                {activeReceipts.map((r, idx) => (
                  <button
                    key={r.id || idx}
                    type="button"
                    onClick={() => {
                      setActiveReceiptIdx(idx);
                      setZoom(1);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap cursor-pointer ${
                      idx === activeReceiptIdx
                        ? 'bg-[#FFD41C] text-slate-950'
                        : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
                    }`}
                  >
                    {r.name || `Receipt ${idx + 1}`}
                  </button>
                ))}
              </div>
            )}

            <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-slate-950">
              {!activeFile ? (
                <div className="text-center text-slate-400 text-xs space-y-2">
                  <FileText className="w-10 h-10 mx-auto text-slate-600" />
                  <p>No receipt image or PDF attached to this line item.</p>
                </div>
              ) : isPdfFile(activeFile.url, activeFile.fileType) ? (
                <iframe
                  src={activeFile.url}
                  title={activeFile.name}
                  className="w-full h-full min-h-[360px] rounded-lg bg-white"
                />
              ) : (
                <img
                  src={activeFile.url}
                  alt={activeFile.name}
                  style={{ transform: `scale(${zoom})` }}
                  className="max-h-full max-w-full object-contain rounded-lg transition-transform duration-150"
                />
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
