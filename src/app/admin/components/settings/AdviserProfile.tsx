import { useState, useEffect, useRef } from 'react';
import {
  Camera, Lock, CheckCircle2, AlertCircle, PenTool, RotateCcw, Upload,
  ShieldCheck, FileSignature, Trash2, Check, Sparkles, UserCheck, Shield,
  ExternalLink
} from 'lucide-react';
import { toast } from 'sonner';
import { useAdviserProfile, updateAdviserProfile } from '../../../modules/auth';
import {
  getSasSignatoryConfig,
  saveSasSignatoryConfig,
} from '../../../modules/signatories/services/sas-signatory.service';

interface AdviserProfileProps {
  onUnsavedChange: () => void;
}

export default function AdviserProfile({ onUnsavedChange }: AdviserProfileProps) {
  const { profile, loading } = useAdviserProfile();
  
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [department, setDepartment] = useState('');
  const [position, setPosition] = useState('');

  // Official Signatory & Digital Signature state
  const [signatureUrl, setSignatureUrl] = useState<string>('');
  const [isRedrawing, setIsRedrawing] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (profile) {
      setFirstName(profile.firstName || '');
      setMiddleName(profile.middleName || '');
      setLastName(profile.lastName || '');
      setPhoneNumber(profile.phoneNumber || '');
      setDepartment(profile.department || '');
      setPosition(profile.position || '');

      const initialSig =
        profile.signatureUrl ||
        profile.signatureDataUrl ||
        getSasSignatoryConfig().signatureUrl ||
        '';
      setSignatureUrl(initialSig);
      if (!initialSig) {
        setIsRedrawing(true);
      }
    }
  }, [profile]);

  useEffect(() => {
    if ((isRedrawing || !signatureUrl) && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }
  }, [isRedrawing, signatureUrl]);

  if (loading) {
    return <div className="p-6 text-gray-500">Loading profile...</div>;
  }

  if (!profile) {
    return <div className="p-6 text-red-500">Profile not found.</div>;
  }

  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  const currentDisplayName = [firstName, middleName, lastName].filter(Boolean).join(' ') || profile.displayName;

  // ── Canvas Interaction Handlers ──
  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setHistory((prev) => [...prev, canvas.toDataURL('image/png')]);

    const { x, y } = getCanvasCoords(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#000000';
    setIsDrawing(true);
    setHasDrawn(true);
    onUnsavedChange();
    setSaveStatus('idle');
  };

  const drawMove = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { x, y } = getCanvasCoords(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      setSignatureUrl(canvas.toDataURL('image/png'));
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
    setHistory([]);
    setSignatureUrl('');
    onUnsavedChange();
    setSaveStatus('idle');
  };

  const handleUndo = () => {
    const canvas = canvasRef.current;
    if (!canvas || history.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const previousState = history[history.length - 1];
    setHistory((prev) => prev.slice(0, prev.length - 1));

    const img = new Image();
    img.src = previousState;
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      setSignatureUrl(canvas.toDataURL('image/png'));
      onUnsavedChange();
    };
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file (PNG, JPG, WebP).');
      return;
    }

    if (file.size > 3 * 1024 * 1024) {
      toast.error('Signature file must be under 3MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setSignatureUrl(dataUrl);
      setIsRedrawing(false);
      onUnsavedChange();
      setSaveStatus('idle');
      toast.success('Signature image loaded successfully!');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleRemoveSignature = () => {
    setSignatureUrl('');
    setIsRedrawing(true);
    setHasDrawn(false);
    setHistory([]);
    onUnsavedChange();
    setSaveStatus('idle');
  };

  // ── Save Handler (Adviser Profile + Global SAS Signatory Sync) ──
  const handleSave = async () => {
    setIsSaving(true);
    setSaveStatus('idle');
    setErrorMessage('');
    
    try {
      const displayName = [firstName, middleName, lastName].filter(Boolean).join(' ');
      const resolvedPosition = position.trim() || 'SAS Coordinator';
      const resolvedDept = department.trim() || 'Student Affairs Office';

      let finalSig = signatureUrl;
      if (isRedrawing && canvasRef.current && hasDrawn) {
        finalSig = canvasRef.current.toDataURL('image/png');
        setSignatureUrl(finalSig);
        setIsRedrawing(false);
      }
      
      // 1. Update personal adviser profile document in `sas_admins`
      await updateAdviserProfile(profile.uid, {
        firstName,
        middleName: middleName || null,
        lastName,
        displayName,
        phoneNumber: phoneNumber || null,
        department: resolvedDept,
        position: resolvedPosition,
        signatureUrl: finalSig || null,
        signatureDataUrl: finalSig || null,
        signatoryRoleTitle: resolvedPosition,
        signatureUpdatedAt: new Date().toISOString(),
      });

      // 2. Synchronize to global SAS Signatory Configuration (for locked organization proposals & approval)
      await saveSasSignatoryConfig({
        name: displayName,
        roleTitle: resolvedPosition,
        email: profile.email,
        department: resolvedDept,
        signatureUrl: finalSig || undefined,
        signatureDataUrl: finalSig || undefined,
      });
      
      setSaveStatus('success');
      toast.success('Adviser profile and official signatory updated successfully!');
      setTimeout(() => setSaveStatus('idle'), 4000);
    } catch (err: any) {
      console.error('Failed to update profile:', err);
      setSaveStatus('error');
      setErrorMessage(err.message || 'An error occurred while saving.');
      toast.error('Failed to save profile: ' + (err.message || 'Please try again.'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleChange = (setter: React.Dispatch<React.SetStateAction<string>>) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setter(e.target.value);
    onUnsavedChange();
    setSaveStatus('idle');
  };

  return (
    <div className="space-y-6 max-w-4xl pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[#001A4D]">Adviser Profile & Signatory</h2>
          <p className="text-sm text-gray-500 mt-1">
            Manage your personal profile, credentials, and official institutional signatory e-signature.
          </p>
        </div>
        <button 
          onClick={handleSave}
          disabled={isSaving}
          className="px-6 py-2.5 bg-gradient-to-r from-[#001A4D] to-[#0E4EBD] text-white rounded-xl font-bold hover:opacity-90 flex items-center justify-center gap-2 disabled:opacity-70 transition-all cursor-pointer shadow-sm active:scale-95"
        >
          {isSaving ? (
            <>
              <RotateCcw className="w-4 h-4 animate-spin" />
              <span>Saving Changes...</span>
            </>
          ) : (
            <>
              <Check className="w-4 h-4 text-[#FFD41C]" />
              <span>Save Profile & Signatory</span>
            </>
          )}
        </button>
      </div>

      {saveStatus === 'success' && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3 text-emerald-800 shadow-xs">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          <p className="font-semibold text-sm">
            Adviser profile and official SAS signatory synchronized successfully across the proposal pipeline.
          </p>
        </div>
      )}

      {saveStatus === 'error' && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3 text-red-700 shadow-xs">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <p className="font-semibold text-sm">{errorMessage}</p>
        </div>
      )}

      {/* ── CARD 1: PERSONAL INFORMATION & CREDENTIALS ── */}
      <div className="bg-white border border-[#E0E0E0] rounded-2xl p-6 shadow-xs space-y-6">
        {/* Avatar & Header Section */}
        <div className="flex items-start gap-6 pb-6 border-b border-gray-100">
          <div className="relative group">
            {profile.avatarUrl ? (
              <img src={profile.avatarUrl} alt={profile.displayName} className="w-20 h-20 rounded-full object-cover ring-2 ring-[#0E4EBD]/20" />
            ) : (
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#001A4D] to-[#0E4EBD] flex items-center justify-center text-white font-bold text-2xl shadow-inner">
                {initials || '?'}
              </div>
            )}
            <div className="absolute inset-0 bg-[#001A4D]/60 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer">
              <Camera className="w-6 h-6 text-white" />
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="text-xl font-bold text-[#001A4D] truncate">{currentDisplayName}</h3>
            <p className="text-[#0E4EBD] font-semibold text-sm truncate mt-0.5">
              {position || profile.position || 'Student Affairs & Services (SAS)'}
            </p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-emerald-100 text-emerald-800 rounded-full text-xs font-semibold">
                <Check className="w-3 h-3 text-emerald-600" />
                {profile.isActive ? 'Active Administrator' : 'Inactive'}
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-blue-100 text-[#001A4D] rounded-full text-xs font-semibold">
                <Shield className="w-3 h-3 text-[#0E4EBD]" />
                SAS Official Signatory
              </span>
            </div>
          </div>
        </div>

        {/* Form Fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1.5">
              First Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={firstName}
              onChange={handleChange(setFirstName)}
              placeholder="e.g. Maria"
              className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#0E4EBD]/30 focus:border-[#0E4EBD] outline-none text-[#001A4D]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1.5">
              Middle Name
            </label>
            <input
              type="text"
              value={middleName}
              onChange={handleChange(setMiddleName)}
              placeholder="e.g. Santos"
              className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#0E4EBD]/30 focus:border-[#0E4EBD] outline-none text-[#001A4D]"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1.5">
              Last Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={lastName}
              onChange={handleChange(setLastName)}
              placeholder="e.g. Dela Cruz, Ed.D."
              className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#0E4EBD]/30 focus:border-[#0E4EBD] outline-none text-[#001A4D]"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1.5">
              Institutional Email Address
            </label>
            <div className="relative">
              <input
                type="email"
                value={profile.email}
                disabled
                className="w-full px-4 py-2.5 text-sm bg-gray-50 border border-gray-300 rounded-xl text-gray-600 font-mono"
              />
              <Lock className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            </div>
            <p className="text-[11px] text-gray-400 mt-1">Verified Google workspace email for STI Ormoc institutional auth.</p>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1.5">
              Contact / Mobile Number
            </label>
            <input
              type="tel"
              value={phoneNumber}
              onChange={handleChange(setPhoneNumber)}
              placeholder="+63 9XX XXX XXXX"
              className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#0E4EBD]/30 focus:border-[#0E4EBD] outline-none text-[#001A4D]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1.5">
              Department / Office <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={department}
              onChange={handleChange(setDepartment)}
              placeholder="e.g. Student Affairs & Services (SAS)"
              className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#0E4EBD]/30 focus:border-[#0E4EBD] outline-none text-[#001A4D]"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1.5">
              Official Position Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={position}
              onChange={handleChange(setPosition)}
              placeholder="e.g. SAS Coordinator / Head of Student Affairs"
              className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#0E4EBD]/30 focus:border-[#0E4EBD] font-semibold text-[#001A4D]"
            />
            <p className="text-[11px] text-blue-600 mt-1 flex items-center gap-1 font-medium">
              <Sparkles className="w-3 h-3 flex-shrink-0" />
              This Position Title is locked into Stage 1 of every organization proposal across the campus.
            </p>
          </div>
        </div>
      </div>

      {/* ── CARD 2: OFFICIAL SIGNATORY & DIGITAL E-SIGNATURE ── */}
      <div className="bg-white border border-[#E0E0E0] rounded-2xl p-6 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#0E4EBD] flex items-center justify-center font-bold">
              <FileSignature className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#001A4D] flex items-center gap-2">
                Official Institutional Signatory & E-Signature
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FFD41C] text-[#001A4D]">
                  Form AP-01
                </span>
              </h3>
              <p className="text-xs text-gray-500">
                Draw or upload your digital signature to authorize Stage 1 proposals and conclude institutional reviews.
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 self-start sm:self-auto">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            Stage 1 Auto-Locked
          </span>
        </div>

        {/* Informational Workflow Callout */}
        <div className="bg-blue-50/70 border border-blue-200/80 rounded-xl p-4 flex items-start gap-3 text-xs text-blue-900 leading-relaxed">
          <div className="w-8 h-8 rounded-lg bg-blue-100 text-[#0E4EBD] flex items-center justify-center flex-shrink-0 mt-0.5">
            <UserCheck className="w-4 h-4" />
          </div>
          <div className="space-y-1">
            <p className="font-bold text-[#001A4D]">How your profile powers the Activity Proposal workflow:</p>
            <ul className="list-disc pl-4 space-y-0.5 text-blue-800">
              <li>When student officers create a proposal, your <strong>Full Name</strong> and <strong>Position Title</strong> are automatically populated and permanently locked on Stage 1.</li>
              <li>When you approve proposals in the Event Proposal Review studio, this electronic signature is stamped on Form AP-01.</li>
            </ul>
          </div>
        </div>

        {/* Live Identity Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
            <span className="text-[10px] uppercase font-bold text-gray-400 block mb-0.5">Signatory Name</span>
            <span className="font-bold text-xs text-[#001A4D] truncate block">{currentDisplayName}</span>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
            <span className="text-[10px] uppercase font-bold text-gray-400 block mb-0.5">Position Title</span>
            <span className="font-bold text-xs text-[#001A4D] truncate block">{position || 'SAS Coordinator'}</span>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
            <span className="text-[10px] uppercase font-bold text-gray-400 block mb-0.5">Institutional Email</span>
            <span className="font-bold text-xs text-[#001A4D] font-mono truncate block">{profile.email}</span>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
            <span className="text-[10px] uppercase font-bold text-gray-400 block mb-0.5">Department</span>
            <span className="font-bold text-xs text-[#001A4D] truncate block">{department || 'Student Affairs'}</span>
          </div>
        </div>

        {/* ── Signature Studio (Display / Pad) ── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <PenTool className="w-4 h-4 text-[#0E4EBD]" />
              <label className="text-xs font-bold uppercase tracking-wider text-[#001A4D]">
                Master E-Signature Stamp <span className="text-red-500">*</span>
              </label>
            </div>
            {signatureUrl && !isRedrawing && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsRedrawing(true)}
                  className="px-3 py-1 bg-blue-50 text-[#0E4EBD] hover:bg-blue-100 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <PenTool className="w-3.5 h-3.5" />
                  Redraw
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1 bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Upload Image
                </button>
                <button
                  type="button"
                  onClick={handleRemoveSignature}
                  className="px-3 py-1 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remove
                </button>
              </div>
            )}
          </div>

          {/* Active Signature View */}
          {signatureUrl && !isRedrawing ? (
            <div className="bg-gradient-to-b from-white to-gray-50 border-2 border-emerald-500/40 rounded-2xl p-5 flex flex-col items-center justify-center relative shadow-xs">
              <div className="absolute top-3 right-3 flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-bold">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                Verified Active Institutional Seal
              </div>

              <div className="h-28 w-full max-w-md flex items-center justify-center overflow-hidden my-2">
                <img
                  src={signatureUrl}
                  alt="Official SAS Signature"
                  className="max-h-full max-w-full object-contain filter contrast-125"
                />
              </div>

              <div className="w-full max-w-sm border-t border-gray-300 pt-2 text-center space-y-0.5">
                <p className="text-xs font-bold text-[#001A4D] uppercase tracking-wide underline underline-offset-4">
                  {currentDisplayName}
                </p>
                <p className="text-[11px] text-gray-600 font-semibold">{position || 'SAS Coordinator'}</p>
                <p className="text-[10px] text-gray-400 font-mono">
                  Sealed Cryptographically • Form AP-01 Official Signatory
                </p>
              </div>
            </div>
          ) : (
            /* Interactive Canvas Pad */
            <div className="bg-white border-2 border-dashed border-gray-300 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span className="font-semibold text-gray-700">
                  Draw your official electronic signature below in pure black ink:
                </span>
                <div className="flex items-center gap-2">
                  {history.length > 0 && (
                    <button
                      type="button"
                      onClick={handleUndo}
                      className="px-2.5 py-1 text-xs font-bold text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-md flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Undo
                    </button>
                  )}
                  {hasDrawn && (
                    <button
                      type="button"
                      onClick={clearCanvas}
                      className="px-2.5 py-1 text-xs font-bold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 rounded-md cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Drawing Area */}
              <div className="border border-gray-200 rounded-xl overflow-hidden bg-slate-50/50 touch-none shadow-inner">
                <canvas
                  ref={canvasRef}
                  width={640}
                  height={180}
                  onMouseDown={startDrawing}
                  onMouseMove={drawMove}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={drawMove}
                  onTouchEnd={stopDrawing}
                  className="w-full h-40 cursor-crosshair block bg-white"
                />
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-gray-400 font-mono">
                    Official black ink • 2.5px vector stroke
                  </span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs text-[#0E4EBD] hover:underline font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Or upload signature image
                  </button>
                </div>

                {signatureUrl && isRedrawing && (
                  <button
                    type="button"
                    onClick={() => setIsRedrawing(false)}
                    className="text-xs text-gray-500 hover:text-gray-800 underline cursor-pointer"
                  >
                    Cancel & Keep Current Signature
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Form AP-01 Signatory Block Preview ── */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-[#001A4D] uppercase tracking-wider flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-[#0E4EBD]" />
              Form AP-01 Live Document Preview
            </span>
            <span className="text-gray-400 text-[10px] font-mono">Official STI AP-01 Format</span>
          </div>
          <p className="text-xs text-gray-500">
            This is how your endorsement signature block will appear on official Activity Proposal documents:
          </p>

          <div className="bg-white border border-gray-300 rounded-lg p-4 max-w-sm mx-auto text-center space-y-1 shadow-xs">
            <div className="h-16 flex items-center justify-center overflow-hidden">
              {signatureUrl ? (
                <img
                  src={signatureUrl}
                  alt="Signature Preview"
                  className="max-h-full max-w-full object-contain filter contrast-125"
                />
              ) : (
                <span className="text-xs text-gray-400 italic">[ No Digital Signature Configured ]</span>
              )}
            </div>
            <div className="border-t border-gray-400 pt-1">
              <p className="text-xs font-black text-gray-900 uppercase tracking-wide">
                {currentDisplayName || 'SIGNATORY NAME'}
              </p>
              <p className="text-[11px] font-semibold text-gray-700">
                {position || 'SAS Coordinator'}
              </p>
              <p className="text-[10px] text-gray-500">
                {department || 'Student Affairs & Services'}
              </p>
              <p className="text-[9px] font-bold text-blue-700 uppercase tracking-wider mt-1">
                Endorsed by (Stage 1 Signatory)
              </p>
            </div>
          </div>
        </div>

        {/* Bottom Save Action Button */}
        <div className="pt-2 flex justify-end">
          <button 
            onClick={handleSave}
            disabled={isSaving}
            className="px-6 py-2.5 bg-gradient-to-r from-[#001A4D] to-[#0E4EBD] text-white rounded-xl font-bold hover:opacity-90 flex items-center gap-2 disabled:opacity-70 transition-all cursor-pointer shadow-sm active:scale-95 text-sm"
          >
            {isSaving ? (
              <>
                <RotateCcw className="w-4 h-4 animate-spin" />
                <span>Saving Profile & Signatory...</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4 text-[#FFD41C]" />
                <span>Save Profile & Signatory</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
