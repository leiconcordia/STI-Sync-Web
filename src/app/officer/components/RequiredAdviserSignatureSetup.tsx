import React, { useRef, useState } from 'react';
import { signOut } from 'firebase/auth';
import {
  PenTool,
  Upload,
  RotateCcw,
  CheckCircle2,
  ShieldCheck,
  AlertCircle,
  Loader2,
  FileSignature,
} from 'lucide-react';
import { toast } from 'sonner';
import { auth } from '../../../services/firebase';
import { uploadToCloudinary } from '../../../services/cloudinary';
import { syncUserSignatureAcrossProfiles } from '../../modules/signatories';
import type { OfficerProfile } from '../../auth/hooks/useOfficerProfile';

const INK_COLOR = '#000000';
const PEN_WIDTH = 2.6;

interface RequiredAdviserSignatureSetupProps {
  profile: OfficerProfile;
  orgName?: string;
  onComplete: (signatureUrl: string) => void;
}

/**
 * Mandatory first-access electronic signature registration screen for newly assigned
 * Primary Club Advisers and Secondary Club Co-Advisers — mirrors RequiredPasswordChange.
 */
export function RequiredAdviserSignatureSetup({
  profile,
  orgName,
  onComplete,
}: RequiredAdviserSignatureSetupProps) {
  const [mode, setMode] = useState<'draw' | 'upload'>('draw');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Draw pad state
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  // Upload state
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedPreviewUrl, setUploadedPreviewUrl] = useState<string>('');

  const isCoAdviser = Boolean(profile.isCoAdviser || profile.adviserRole === 'co_adviser');
  const roleLabel = isCoAdviser ? 'Club Co-Adviser' : 'Club Adviser';

  const getCanvasPoint = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    return {
      x: ((clientX - rect.left) * canvas.width) / rect.width,
      y: ((clientY - rect.top) * canvas.height) / rect.height,
    };
  };

  const startDrawing = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pt = getCanvasPoint(e);
    lastPointRef.current = pt;
    setIsDrawing(true);
    setError('');

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = INK_COLOR;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, PEN_WIDTH / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    setHasDrawn(true);
  };

  const draw = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    if (!isDrawing || !lastPointRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pt = getCanvasPoint(e);
    ctx.strokeStyle = INK_COLOR;
    ctx.lineWidth = PEN_WIDTH;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();

    lastPointRef.current = pt;
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
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please upload a PNG or JPG image of your signature.');
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setError('Signature image must be 3 MB or smaller.');
      return;
    }
    setError('');
    setUploadedFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setUploadedPreviewUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveSignature = async () => {
    setError('');
    let finalUrl = '';

    setBusy(true);
    try {
      if (mode === 'draw') {
        const canvas = canvasRef.current;
        if (!hasDrawn || !canvas) {
          setError('Please draw your official signature on the pad before continuing.');
          setBusy(false);
          return;
        }
        const dataUrl = canvas.toDataURL('image/png');
        let blob: Blob | null = null;
        try {
          blob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob((b) => resolve(b), 'image/png')
          );
        } catch {}

        if (blob) {
          try {
            const sigFile = new File([blob], `adviser-signature-${Date.now()}.png`, {
              type: 'image/png',
            });
            const uploaded = await uploadToCloudinary(sigFile, {
              folder: 'sti_sync_signatures/advisers',
            });
            finalUrl = uploaded.secureUrl || dataUrl;
          } catch {
            finalUrl = dataUrl;
          }
        } else {
          finalUrl = dataUrl;
        }
      } else {
        if (!uploadedFile && !uploadedPreviewUrl) {
          setError('Please upload your signature image before continuing.');
          setBusy(false);
          return;
        }
        if (uploadedFile) {
          try {
            const uploaded = await uploadToCloudinary(uploadedFile, {
              folder: 'sti_sync_signatures/advisers',
            });
            finalUrl = uploaded.secureUrl || uploadedPreviewUrl;
          } catch {
            finalUrl = uploadedPreviewUrl;
          }
        } else {
          finalUrl = uploadedPreviewUrl;
        }
      }

      if (!finalUrl) {
        throw new Error('Could not capture your signature. Please try again.');
      }

      await syncUserSignatureAcrossProfiles({
        uid: profile.authUid || profile.uid || auth.currentUser?.uid || '',
        email: profile.email,
        name: profile.studentName || roleLabel,
        role: 'adviser',
        roleTitle: roleLabel,
        signatureUrl: finalUrl,
      });

      toast.success('Electronic signature registered successfully!');
      onComplete(finalUrl);
    } catch (err: any) {
      setError(err?.message || 'Failed to save electronic signature. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  async function logout() {
    const { clearPortalSessions } = await import('../../auth/services/portal-workspace.service');
    clearPortalSessions();
    await signOut(auth);
    window.location.assign('/portal/login');
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-100 to-slate-200/80 p-4 sm:p-6">
      <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-xl animate-in fade-in duration-200">
        {/* Top Accent Stripe */}
        <div className="h-2 w-full bg-gradient-to-r from-[#FFD41C] via-[#0E4EBD] to-[#001A4D]" />

        <div className="p-6 sm:p-8 space-y-5">
          {/* Header */}
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-200 text-[#001A4D] flex items-center justify-center shrink-0 shadow-inner">
              <FileSignature className="w-6 h-6 text-[#0E4EBD]" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-amber-100 text-amber-900 rounded-full text-[10px] font-bold uppercase tracking-wider mb-1">
                Required Signature Setup
              </div>
              <h1 className="text-xl font-extrabold text-[#001A4D]">
                Register your electronic signature
              </h1>
              <p className="text-xs text-gray-500 mt-0.5">
                {roleLabel} Account · {profile.email}
              </p>
            </div>
          </div>

          <div className="text-xs text-blue-950 bg-blue-50/80 border border-blue-200 rounded-xl p-3.5 leading-relaxed space-y-1">
            <p className="font-bold text-[#001A4D]">
              Welcome, {profile.studentName || roleLabel}
              {orgName && orgName !== 'Organization' ? ` (${orgName})` : ''}!
            </p>
            <p className="text-gray-600">
              Before entering the Organization Portal, please register your official black-ink electronic signature. It will be used to endorse Activity Proposals, Financial Liquidations, Post-Activity Reports, and Supplemental Budget Requests.
            </p>
          </div>

          {/* Mode Tabs */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => {
                setMode('draw');
                setError('');
              }}
              className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                mode === 'draw'
                  ? 'bg-[#001A4D] text-[#FFD41C] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <PenTool className="w-3.5 h-3.5" />
              <span>Draw Signature</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('upload');
                setError('');
              }}
              className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                mode === 'upload'
                  ? 'bg-[#001A4D] text-[#FFD41C] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Upload Image</span>
            </button>
          </div>

          {/* Draw Pad */}
          {mode === 'draw' ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-gray-700 uppercase tracking-wide">
                  Sign Inside Box (Black Ink)
                </span>
                <button
                  type="button"
                  onClick={clearCanvas}
                  disabled={!hasDrawn || busy}
                  className="text-xs font-semibold text-slate-600 hover:text-rose-600 inline-flex items-center gap-1 disabled:opacity-40 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Clear Pad</span>
                </button>
              </div>
              <div className="relative rounded-2xl border-2 border-dashed border-slate-300 bg-white overflow-hidden">
                <canvas
                  ref={canvasRef}
                  width={560}
                  height={190}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={(e) => {
                    e.preventDefault();
                    startDrawing(e);
                  }}
                  onTouchMove={(e) => {
                    e.preventDefault();
                    draw(e);
                  }}
                  onTouchEnd={stopDrawing}
                  className="w-full h-44 touch-none cursor-crosshair block"
                />
                {!hasDrawn && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-slate-400">
                    Draw your signature here using mouse, trackpad, or touch
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleFileSelect}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full p-6 rounded-2xl border-2 border-dashed border-slate-300 hover:border-[#0E4EBD] hover:bg-blue-50/40 transition-colors flex flex-col items-center justify-center gap-2 cursor-pointer"
              >
                {uploadedPreviewUrl ? (
                  <>
                    <img
                      src={uploadedPreviewUrl}
                      alt="Uploaded signature preview"
                      className="max-h-24 object-contain"
                    />
                    <span className="text-xs font-semibold text-[#0E4EBD]">
                      Click to replace signature image
                    </span>
                  </>
                ) : (
                  <>
                    <Upload className="w-6 h-6 text-[#0E4EBD]" />
                    <span className="text-xs font-bold text-[#001A4D]">
                      Click to upload signature image
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Transparent PNG recommended (max 3 MB)
                    </span>
                  </>
                )}
              </button>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center gap-2 text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              Your signature is securely synced to your {roleLabel} profile and can be updated anytime in Portal Settings.
            </span>
          </div>

          <div className="space-y-2.5 pt-1">
            <button
              type="button"
              disabled={busy || (mode === 'draw' ? !hasDrawn : !uploadedPreviewUrl)}
              onClick={handleSaveSignature}
              className="w-full py-3 px-4 rounded-xl bg-[#001A4D] hover:bg-[#0E4EBD] text-[#FFD41C] font-bold text-sm transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              {busy ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving Signature...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Save Signature &amp; Continue to Dashboard</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={logout}
              disabled={busy}
              className="w-full py-2 text-xs font-semibold text-gray-500 hover:text-gray-800 transition-colors cursor-pointer"
            >
              Sign out and use another account
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
