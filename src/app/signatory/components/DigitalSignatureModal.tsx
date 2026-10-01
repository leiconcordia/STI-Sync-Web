/**
 * src/app/signatory/components/DigitalSignatureModal.tsx
 *
 * Dedicated digital signature studio for Institutional Signatories.
 * Pure black ink vector signature pad with touch and stylus support.
 * Directly saves and syncs signature data into the Firestore database.
 */

import React, { useRef, useState, useEffect } from 'react';
import {
  FileSignature,
  PenTool,
  RotateCcw,
  CheckCircle,
  X,
  ShieldCheck,
  Database,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { auth } from '../../../services/firebase';
import { saveSignatorySignatureInDatabase } from '../../modules/signatories/services/signatory.service';

interface DigitalSignatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  signatoryUid?: string;
  signatoryName?: string;
  signatoryEmail?: string;
  currentSignatureUrl?: string;
  onSignatureSaved: (newUrl: string) => void;
}

// Strict black ink for official institutional documentation
const INK_COLOR = '#000000';
const PEN_WIDTH = 2.5;

export default function DigitalSignatureModal({
  isOpen,
  onClose,
  signatoryUid,
  signatoryName,
  signatoryEmail,
  currentSignatureUrl,
  onSignatureSaved,
}: DigitalSignatureModalProps) {
  const [isSaving, setIsSaving] = useState(false);

  // Canvas Drawing Refs & State
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (isOpen) {
      // Clear and initialize transparent canvas
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          setHasDrawn(false);
        }
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // ── Canvas Drawing Handlers ──
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const x = clientX - rect.left;
    const y = clientY - rect.top;

    lastPointRef.current = { x, y };
    setIsDrawing(true);

    // Register initial dot so single tap creates a mark
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = INK_COLOR;
      ctx.beginPath();
      ctx.arc(x, y, PEN_WIDTH / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    setHasDrawn(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !lastPointRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const currentX = clientX - rect.left;
    const currentY = clientY - rect.top;

    // Strict black ink styling
    ctx.strokeStyle = INK_COLOR;
    ctx.lineWidth = PEN_WIDTH;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
    ctx.lineTo(currentX, currentY);
    ctx.stroke();

    lastPointRef.current = { x: currentX, y: currentY };
    setHasDrawn(true);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    lastPointRef.current = null;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  // ── Save Signature in Database ──
  const handleSave = async () => {
    const canvas = canvasRef.current;
    if (!hasDrawn || !canvas) {
      toast.error('Please draw your signature on the pad before saving.');
      return;
    }

    const signatureDataUrl = canvas.toDataURL('image/png');
    let signatureBlob: Blob | null = null;
    try {
      signatureBlob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((blob) => resolve(blob), 'image/png');
      });
    } catch (blobErr) {
      console.warn('Canvas toBlob warning:', blobErr);
    }

    // Convert dataURL to Blob fallback if toBlob returned null
    if (!signatureBlob && signatureDataUrl) {
      try {
        const arr = signatureDataUrl.split(',');
        const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png';
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
          u8arr[n] = bstr.charCodeAt(n);
        }
        signatureBlob = new Blob([u8arr], { type: mime });
      } catch (convertErr) {
        console.warn('DataURL to blob fallback warning:', convertErr);
      }
    }

    // Resolve effective ID and email
    const effectiveId = signatoryUid || auth.currentUser?.uid || '';
    const effectiveEmail = signatoryEmail || auth.currentUser?.email || '';

    setIsSaving(true);
    try {
      const res = await saveSignatorySignatureInDatabase(
        { id: effectiveId, email: effectiveEmail },
        signatureBlob,
        signatureDataUrl
      );
      
      onSignatureSaved(res.signatureUrl);
      toast.success('Official digital signature saved in database successfully!');
      onClose();
    } catch (err: any) {
      console.error('Signature database save error:', err);
      toast.error('Failed to save signature: ' + (err.message || 'Please try again.'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-gray-100 animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-[#001A4D] px-6 py-4 flex items-center justify-between text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#FFD41C]/20 border border-[#FFD41C]/40 text-[#FFD41C] flex items-center justify-center flex-shrink-0">
              <FileSignature className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base tracking-wide text-white">
                Official Signature Studio
              </h3>
              <p className="text-xs text-gray-300">Signatory: {signatoryName || 'Institutional Signatory'}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4">
          {/* Canvas Controls Header */}
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-gray-100 text-gray-800 text-[11px] font-bold">
                <span className="w-2.5 h-2.5 rounded-full bg-black inline-block" />
                Black Ink
              </span>
              <span className="text-[11px] text-gray-400">
                (Institutional Standard)
              </span>
            </div>

            <button
              type="button"
              onClick={clearCanvas}
              className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700 font-semibold px-2 py-1 rounded-md hover:bg-red-50 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Clear Pad
            </button>
          </div>

          {/* Drawing Pad Canvas */}
          <div className="relative border-2 border-dashed border-gray-300 rounded-2xl bg-white overflow-hidden shadow-inner hover:border-gray-400 transition-colors">
            <canvas
              ref={canvasRef}
              width={460}
              height={190}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
              className="w-full h-[190px] cursor-crosshair touch-none block"
            />
            {!hasDrawn && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-gray-400 text-xs gap-1 select-none">
                <PenTool className="w-5 h-5 text-gray-300 mb-1" />
                <span className="font-medium">Draw your official signature here</span>
                <span className="text-[10px] text-gray-400">Use mouse, stylus, or touchscreen</span>
              </div>
            )}
            {/* Formal baseline guideline */}
            <div className="absolute bottom-7 left-8 right-8 border-b border-gray-200 pointer-events-none flex justify-between">
              <span className="text-[9px] text-gray-300 uppercase tracking-widest pl-1 select-none">Signature Line</span>
              <span className="text-[9px] text-gray-300 pr-1 select-none">✕</span>
            </div>
          </div>

          <div className="flex items-center gap-2 p-2.5 bg-blue-50/70 border border-blue-100 rounded-xl text-blue-900 text-[11px]">
            <Database className="w-4 h-4 text-[#0E4EBD] flex-shrink-0" />
            <span>
              Your digital signature will be securely saved into the institutional database and applied to verified endorsements.
            </span>
          </div>

          {/* Current Active Signature on Record Preview */}
          {currentSignatureUrl && (
            <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-xs bg-gray-50/80 p-3 rounded-xl border">
              <span className="text-gray-600 flex items-center gap-1.5 font-medium">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                Active Database Signature
              </span>
              <div className="bg-white px-3 py-1 rounded-lg border border-gray-200">
                <img
                  src={currentSignatureUrl}
                  alt="Active Signature"
                  className="h-7 max-w-[130px] object-contain filter contrast-125"
                />
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-gray-50 px-6 py-4 flex items-center justify-end gap-3 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2 border border-gray-300 text-gray-700 text-xs font-semibold rounded-xl hover:bg-white transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="px-5 py-2.5 bg-[#001A4D] hover:bg-[#0A2E6D] text-white text-xs font-bold rounded-xl shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all cursor-pointer"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                Saving...
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4 text-[#FFD41C]" />
                Save Signature
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
