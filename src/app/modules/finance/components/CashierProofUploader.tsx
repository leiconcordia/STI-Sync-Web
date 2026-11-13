import React, { useState, useRef } from 'react';
import { Upload, X, FileText, Image as ImageIcon, Loader2, ExternalLink, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { uploadToCloudinary } from '../../../../services/cloudinary';
import type { ReceiptAttachment } from '../types/liquidation.types';

export interface CashierProofUploaderProps {
  proofs: ReceiptAttachment[];
  onChange: (nextProofs: ReceiptAttachment[]) => void;
  cashierReferenceNo?: string;
  onReferenceNoChange?: (refNo: string) => void;
  folderKey?: string;
  title?: string;
  description?: string;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
}

function getFileTypeCategory(fileName: string, mimeType?: string): ReceiptAttachment['fileType'] {
  const lower = fileName.toLowerCase();
  const mime = (mimeType || '').toLowerCase();
  if (mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(lower)) return 'image';
  if (mime === 'application/pdf' || lower.endsWith('.pdf')) return 'pdf';
  return 'document';
}

export function CashierProofUploader({
  proofs,
  onChange,
  cashierReferenceNo = '',
  onReferenceNoChange,
  folderKey = 'general',
  title = 'Cashier Return / Settlement Proof (Multiple Files Supported)',
  description = 'Upload official Cashier receipt(s), return slip(s), or settlement proof. You may select multiple images or PDFs.',
  required = false,
  disabled = false,
  readOnly = false,
}: CashierProofUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0 || disabled || readOnly) return;
    setIsUploading(true);
    try {
      const uploaded: ReceiptAttachment[] = [];
      for (const file of Array.from(files)) {
        const res = await uploadToCloudinary(file, {
          folder: `cashier-proofs/${folderKey}`,
          acceptedTypes: ['image/*', 'application/pdf'],
        });
        uploaded.push({
          id: `cashier-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          url: res.secureUrl,
          name: file.name,
          fileType: getFileTypeCategory(file.name, file.type),
          size: file.size,
          publicId: res.publicId,
        });
      }
      onChange([...(proofs || []), ...uploaded]);
      toast.success(`Uploaded ${uploaded.length} Cashier proof file${uploaded.length > 1 ? 's' : ''}.`);
    } catch (err: any) {
      console.error('[CashierProofUploader] Upload error:', err);
      toast.error(err?.message || 'Failed to upload Cashier proof file(s).');
    } finally {
      setIsUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleRemove = (id: string) => {
    if (disabled || readOnly) return;
    onChange((proofs || []).filter((p) => p.id !== id));
  };

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-xs font-bold text-[#001A4D] flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-[#0E4EBD]" />
            <span>{title}</span>
            {required && <span className="text-red-500">*</span>}
          </h4>
          <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">{description}</p>
        </div>
        {!readOnly && (
          <div>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept="image/*,.pdf"
              className="hidden"
              disabled={disabled || isUploading}
              onChange={(e) => handleFilesSelected(e.target.files)}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={disabled || isUploading}
              className="px-3 py-1.5 rounded-lg bg-[#001A4D] hover:bg-[#0E4EBD] text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Uploading...</span>
                </>
              ) : (
                <>
                  <Upload className="w-3.5 h-3.5 text-[#FFD41C]" />
                  <span>Upload Cashier Proof</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {onReferenceNoChange && (
        <div>
          <label className="block text-[11px] font-bold text-slate-700 mb-1">
            Cashier Official Receipt / Return Slip # (Optional)
          </label>
          <input
            type="text"
            value={cashierReferenceNo}
            onChange={(e) => onReferenceNoChange(e.target.value)}
            disabled={disabled || readOnly}
            placeholder="e.g., OR-2026-00412"
            className="w-full px-3 py-1.5 bg-white border border-blue-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0E4EBD]/30 disabled:bg-slate-100"
          />
        </div>
      )}

      {proofs && proofs.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {proofs.map((file) => (
            <div
              key={file.id}
              className="flex items-center justify-between gap-2 bg-white border border-blue-100 rounded-lg p-2 shadow-2xs"
            >
              <a
                href={file.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 min-w-0 flex-1 hover:text-[#0E4EBD] transition-colors"
              >
                {file.fileType === 'image' ? (
                  <img
                    src={file.url}
                    alt={file.name}
                    className="w-8 h-8 rounded object-cover border border-slate-200 flex-shrink-0"
                  />
                ) : (
                  <div className="w-8 h-8 rounded bg-blue-50 text-[#0E4EBD] flex items-center justify-center flex-shrink-0">
                    {file.fileType === 'pdf' ? <FileText className="w-4 h-4" /> : <ImageIcon className="w-4 h-4" />}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold text-slate-800 truncate">{file.name}</p>
                  <p className="text-[10px] text-[#0E4EBD] flex items-center gap-0.5">
                    <span>View proof</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </p>
                </div>
              </a>
              {!readOnly && !disabled && (
                <button
                  type="button"
                  onClick={() => handleRemove(file.id)}
                  className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                  title="Remove file"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-[11px] text-slate-500 italic bg-white/70 border border-dashed border-blue-200 rounded-lg px-3 py-2 text-center">
          No Cashier proof files uploaded yet.
        </div>
      )}
    </div>
  );
}

export default CashierProofUploader;

