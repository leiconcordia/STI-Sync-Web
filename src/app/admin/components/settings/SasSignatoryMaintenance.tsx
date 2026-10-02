/**
 * src/app/admin/components/settings/SasSignatoryMaintenance.tsx
 *
 * Dedicated SAS Signatory Maintenance Panel in System Settings.
 * Allows Student Affairs & Services (SAS) to:
 * - Maintain official Signatory Name and Position Title (which are automatically populated
 *   and permanently locked on all organization-created Activity Proposals).
 * - Configure the official SAS institutional email and office department.
 * - Draw or upload the official SAS electronic signature ("where the sas can Also sign it")
 *   with live canvas pad, real-time preview, and black-ink certification.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  FileSignature,
  ShieldCheck,
  Lock,
  CheckCircle2,
  AlertCircle,
  PenTool,
  RotateCcw,
  Upload,
  Save,
  Building,
  User,
  Mail,
  Award,
  Layers,
  Sparkles,
  Info,
  Calendar,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  getSasSignatoryConfig,
  saveSasSignatoryConfig,
  type SasSignatoryConfig,
  DEFAULT_SAS_SIGNATORY_CONFIG,
} from '../../../modules/signatories/services/sas-signatory.service';
import { useAdviserProfile } from '../../../modules/auth';

const INK_COLOR = '#000000';
const PEN_WIDTH = 2.5;

export default function SasSignatoryMaintenance() {
  const { profile } = useAdviserProfile();

  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Form Fields
  const [name, setName] = useState(DEFAULT_SAS_SIGNATORY_CONFIG.name);
  const [roleTitle, setRoleTitle] = useState(DEFAULT_SAS_SIGNATORY_CONFIG.roleTitle);
  const [email, setEmail] = useState(DEFAULT_SAS_SIGNATORY_CONFIG.email);
  const [department, setDepartment] = useState(DEFAULT_SAS_SIGNATORY_CONFIG.department);
  const [employeeId, setEmployeeId] = useState(DEFAULT_SAS_SIGNATORY_CONFIG.employeeId || '');

  // Signature State
  const [savedSignatureUrl, setSavedSignatureUrl] = useState<string | null>(null);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);

  // Canvas Refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Load current configuration
  useEffect(() => {
    let isMounted = true;
    getSasSignatoryConfig().then((cfg) => {
      if (!isMounted) return;
      setName(cfg.name || profile?.displayName || DEFAULT_SAS_SIGNATORY_CONFIG.name);
      setRoleTitle(cfg.roleTitle || profile?.position || DEFAULT_SAS_SIGNATORY_CONFIG.roleTitle);
      setEmail(cfg.email || profile?.email || DEFAULT_SAS_SIGNATORY_CONFIG.email);
      setDepartment(cfg.department || profile?.department || DEFAULT_SAS_SIGNATORY_CONFIG.department);
      setEmployeeId(cfg.employeeId || '');
      if (cfg.signatureUrl || cfg.signatureDataUrl) {
        setSavedSignatureUrl(cfg.signatureUrl || cfg.signatureDataUrl || null);
        setSignatureDataUrl(cfg.signatureUrl || cfg.signatureDataUrl || null);
      }
      setLoading(false);
    });
    return () => {
      isMounted = false;
    };
  }, [profile]);

  // ── Canvas Handlers ──
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
    if (isDrawing && canvasRef.current) {
      setSignatureDataUrl(canvasRef.current.toDataURL('image/png'));
    }
    setIsDrawing(false);
    lastPointRef.current = null;
  };

  const handleClearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    setHasDrawn(false);
    setSignatureDataUrl(null);
  };

  // Image Upload handler
  const handleUploadSignature = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file (PNG, JPG, or SVG).');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Scale image to fit canvas proportionally
        const hRatio = canvas.width / img.width;
        const vRatio = canvas.height / img.height;
        const ratio = Math.min(hRatio, vRatio, 1) * 0.8;
        const centerShiftX = (canvas.width - img.width * ratio) / 2;
        const centerShiftY = (canvas.height - img.height * ratio) / 2;

        ctx.drawImage(img, 0, 0, img.width, img.height, centerShiftX, centerShiftY, img.width * ratio, img.height * ratio);

        const dataUrl = canvas.toDataURL('image/png');
        setSignatureDataUrl(dataUrl);
        setHasDrawn(true);
        toast.success('Signature image loaded successfully onto pad.');
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  // ── Save All Configurations ──
  const handleSaveAll = async () => {
    if (!name.trim()) {
      toast.error('Signatory Full Name is required.');
      return;
    }
    if (!roleTitle.trim()) {
      toast.error('Official Position Title is required.');
      return;
    }
    if (!email.trim()) {
      toast.error('Official Email address is required.');
      return;
    }

    setIsSaving(true);
    setSaveSuccess(false);

    try {
      const effectiveSig = signatureDataUrl || savedSignatureUrl || undefined;

      const result = await saveSasSignatoryConfig(
        {
          name: name.trim(),
          roleTitle: roleTitle.trim(),
          email: email.trim().toLowerCase(),
          department: department.trim(),
          employeeId: employeeId.trim(),
          signatureUrl: effectiveSig,
          signatureDataUrl: effectiveSig,
        },
        profile?.uid
      );

      if (effectiveSig) {
        setSavedSignatureUrl(effectiveSig);
      }

      setSaveSuccess(true);
      toast.success('SAS Signatory Profile and E-Signature saved successfully!');
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err: any) {
      console.error('Failed to save SAS Signatory config:', err);
      toast.error(err?.message || 'Failed to save SAS Signatory configuration.');
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-slate-500 gap-3">
        <div className="w-5 h-5 border-2 border-[#001A4D] border-t-transparent rounded-full animate-spin" />
        <span className="text-sm font-semibold">Loading SAS Signatory Maintenance...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl pb-10">
      {/* ── HEADER ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-[#001A4D] flex items-center justify-center shadow-xs">
              <ShieldCheck className="w-6 h-6 text-[#0E4EBD]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-[#001A4D] tracking-tight">
                  SAS Signatory Maintenance & E-Signature
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-100 text-[#001A4D] border border-blue-200">
                  First-Gate Authority
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Official Student Affairs & Services identity and signature sealed across all organization activity proposals.
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSaveAll}
          disabled={isSaving}
          className="px-5 py-2.5 bg-gradient-to-r from-[#001A4D] to-[#0E4EBD] hover:from-[#0A2E6D] hover:to-[#1660D8] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-50 cursor-pointer self-start sm:self-auto"
        >
          <Save className="w-4 h-4 text-[#FFD41C]" />
          <span>{isSaving ? 'Saving Master Settings...' : 'Save SAS Signatory & Signature'}</span>
        </button>
      </div>

      {/* Success Banner */}
      {saveSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-3 text-emerald-800 animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          <div className="text-xs">
            <span className="font-bold">Settings Successfully Synchronized!</span>
            <p className="text-emerald-700 mt-0.5">
              All proposals created by student organizations will now automatically lock to <strong>{name}</strong> (<strong>{roleTitle}</strong>).
            </p>
          </div>
        </div>
      )}

      {/* Policy Callout Banner */}
      <div className="p-4 bg-blue-50/70 border border-blue-200 rounded-2xl flex items-start gap-3.5">
        <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center flex-shrink-0 mt-0.5 shadow-2xs">
          <Lock className="w-3.5 h-3.5" />
        </div>
        <div className="text-xs space-y-1">
          <h4 className="font-bold text-[#001A4D]">
            Automatic & Locked First-Gate Institutional Governance
          </h4>
          <p className="text-slate-600 leading-relaxed">
            By institutional policy, whenever a student organization creates an Activity Proposal (Form AP-01),
            <strong> Stage 1 is permanently dedicated to Student Affairs & Services (SAS)</strong>.
            The <strong>Signatory Name</strong> and <strong>Position Title</strong> configured below are
            <strong> automatically populated and locked</strong> — student officers cannot alter, override, or delete this first sign-off gate.
          </p>
        </div>
      </div>

      {/* ── SECTION 1: OFFICIAL SIGNATORY IDENTITY ── */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
          <User className="w-4 h-4 text-[#0E4EBD]" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
            1. Authorized SAS Signatory Details
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5">
              Official Signatory Full Name <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Riselle Mae B. Lucanas"
                className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 border border-gray-300 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-[#001A4D]/20 focus:border-[#001A4D] outline-none transition-all"
              />
              <User className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              Appears on the "Endorsed by" signature line of official Form AP-01 proposals.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5">
              Official Position Title <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={roleTitle}
                onChange={(e) => setRoleTitle(e.target.value)}
                placeholder="e.g. Student Affairs & Services Head / SAS Coordinator"
                className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 border border-gray-300 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-[#001A4D]/20 focus:border-[#001A4D] outline-none transition-all"
              />
              <Award className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              Official job designation (e.g., "Student Affairs & Services Head" or "SAS Coordinator").
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5">
              Official Institutional Email <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="sao@ormoc.sti.edu.ph"
                className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 border border-gray-300 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:ring-2 focus:ring-[#001A4D]/20 focus:border-[#001A4D] outline-none transition-all"
              />
              <Mail className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              Receives automated submission alerts and approval notifications.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5">
              Department / Office Name
            </label>
            <div className="relative">
              <input
                type="text"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="Student Affairs & Services"
                className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 border border-gray-300 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:ring-2 focus:ring-[#001A4D]/20 focus:border-[#001A4D] outline-none transition-all"
              />
              <Building className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              Institutional department branch associated with this endorsement.
            </p>
          </div>
        </div>
      </div>

      {/* ── SECTION 2: E-SIGNATURE STUDIO ("WHERE THE SAS CAN ALSO SIGN IT") ── */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-gray-100 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <PenTool className="w-4 h-4 text-[#0E4EBD]" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              2. Master Digital E-Signature Studio
            </h3>
          </div>
          <span className="text-[11px] text-slate-500 font-medium">
            Strict Institutional Black Ink Standard (#000000)
          </span>
        </div>

        <p className="text-xs text-slate-600">
          Draw or upload your official digital signature below. Once saved, SAS can directly endorse and digitally sign
          organization proposals, automatically stamping this authorized electronic seal onto Stage 1 and official PDF exports.
        </p>

        {/* Live Canvas Signature Pad */}
        <div className="space-y-3">
          <div className="relative border-2 border-dashed border-slate-300 hover:border-blue-400 rounded-2xl bg-slate-50/50 p-2 transition-colors">
            <canvas
              ref={canvasRef}
              width={640}
              height={180}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
              className="w-full h-44 bg-white rounded-xl cursor-crosshair touch-none shadow-2xs"
            />

            {/* Watermark Guidelines */}
            <div className="absolute inset-x-8 bottom-8 border-b border-slate-200 pointer-events-none flex justify-between text-[10px] text-slate-300 font-semibold px-2">
              <span>Sign Above This Line</span>
              <span>STI Official Seal</span>
            </div>

            {!hasDrawn && !signatureDataUrl && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-slate-400">
                <PenTool className="w-6 h-6 mb-1 text-slate-300" />
                <span className="text-xs font-medium">Draw your official signature here using mouse, touch, or stylus</span>
              </div>
            )}
          </div>

          {/* Canvas Controls */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleClearCanvas}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                <span>Clear Pad</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-slate-500" />
                <span>Upload Signature Image</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={handleUploadSignature}
                className="hidden"
              />
            </div>

            <div className="text-[11px] text-slate-400">
              Vector resolution with anti-aliasing • Ready for official high-resolution AP-01 prints
            </div>
          </div>
        </div>

        {/* Current Active Signature Preview Box */}
        {(savedSignatureUrl || signatureDataUrl) && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Active Authorized Signature on File
              </span>
              <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                Verified Electronic Seal
              </span>
            </div>

            <div className="p-4 bg-white border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="h-16 w-36 bg-slate-50 border border-slate-200 rounded-lg p-1.5 flex items-center justify-center">
                  <img
                    src={signatureDataUrl || savedSignatureUrl || ''}
                    alt="Active SAS Signature"
                    className="max-h-full max-w-full object-contain filter contrast-125"
                  />
                </div>
                <div>
                  <h5 className="font-bold text-slate-800 text-xs">{name}</h5>
                  <p className="text-[11px] text-[#0E4EBD] font-semibold">{roleTitle}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{department}</p>
                </div>
              </div>

              <div className="text-right text-[11px] text-slate-500">
                <span>Stamped onto Stage 1 upon endorsement</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── SECTION 3: LIVE PREVIEW OF HOW PROPOSALS WILL DISPLAY ── */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[#0E4EBD]" />
          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            Live Preview on Student Proposal Wizard (Step 15 Signatory Pipeline)
          </h4>
        </div>
        <p className="text-xs text-slate-500">
          This is exactly how Stage 1 displays and locks when a student organization opens the Activity Proposal builder:
        </p>

        {/* Mock Stage 1 Locked Card */}
        <div className="bg-white border-2 border-blue-300 rounded-xl p-4 shadow-2xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded-md bg-blue-700 text-white font-bold text-xs flex items-center justify-center">
                1
              </div>
              <span className="font-bold text-xs text-slate-800">
                Stage 1: Student Affairs & Services (SAS) Endorsement
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-300 flex items-center gap-1">
                <Lock className="w-3 h-3 text-blue-600" />
                Mandatory First Gate (Auto & Locked)
              </span>
            </div>
          </div>

          <div className="p-3 bg-blue-50/40 border border-blue-200 rounded-xl flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#001A4D] text-[#FFD41C] font-bold text-xs flex items-center justify-center">
                {name.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-800 text-xs">{name}</span>
                  <span className="text-[11px] text-slate-500 font-normal">({email})</span>
                  <span className="px-1.5 py-0.2 bg-blue-100/70 text-blue-700 text-[9px] font-bold rounded">
                    Locked
                  </span>
                </div>
                <div className="text-[11px] text-blue-900 font-semibold mt-0.5">
                  {roleTitle} • <span className="text-slate-500">{department}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="px-2.5 py-1 rounded-lg text-[10px] font-bold border bg-blue-50 text-blue-800 border-blue-200 flex items-center gap-1 select-none">
                <FileSignature className="w-3.5 h-3.5 text-blue-600" />
                <span>Endorser (Gate 1)</span>
              </div>
              <div className="px-2 py-1 rounded-lg text-[10px] font-bold border bg-blue-100/70 text-blue-800 border-blue-300 flex items-center gap-1 select-none">
                <Lock className="w-3 h-3 text-blue-600" />
                <span>Mandatory (SAS)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
