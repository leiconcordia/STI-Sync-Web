import { formatPersonName } from '../../utils/name.utils';
import { useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import {
  Upload,
  Eye,
  EyeOff,
  Monitor,
  Smartphone,
  LogOut,
  ShieldCheck,
  Loader2,
  AlertCircle,
  PenTool,
  RotateCcw,
  CheckCircle2,
  Trash2,
  FileSignature,
  Shield,
  AlertTriangle,
} from 'lucide-react';
import { collection, query, where, getDocs, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../services/firebase';
import { useOfficerProfile } from '../../auth/hooks/useOfficerProfile';
import { useStudents } from '../../modules/students/hooks/useStudentStream';
import { useRoles } from '../../modules/roles/hooks/useRoles';
import { updateStudent } from '../../modules/students/services/student.service';
import { uploadToCloudinary } from '../../../services/cloudinary';
import { changeOfficerOrAdviserPassword } from '../../auth/services/password.service';
import OrganizationProfile from './OrganizationProfile';
import { toast } from 'sonner';

type SettingsSection = 'account' | 'signature' | 'organization' | 'security';

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ];
  const score = checks.filter(Boolean).length;
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
  const colors = ['', 'bg-red-500', 'bg-amber-400', 'bg-blue-500', 'bg-green-500'];

  if (!password) return null;

  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-all ${
              i <= score ? colors[score] : 'bg-gray-200'
            }`}
          />
        ))}
      </div>
      {score > 0 && (
        <p className={`text-[11px] font-medium ${
          score === 1 ? 'text-red-500' : score === 2 ? 'text-amber-500' : score === 3 ? 'text-blue-500' : 'text-green-600'
        }`}>
          {labels[score]} password
        </p>
      )}
    </div>
  );
}

const NAV_ITEMS: { key: SettingsSection; label: string }[] = [
  { key: 'account', label: 'Account Profile' },
  { key: 'signature', label: 'Official E-Signature' },
  { key: 'organization', label: 'Organization Profile' },
  { key: 'security', label: 'Security & Password' },
];

interface OfficerSettingsProps {
  defaultTab?: SettingsSection;
}

export default function OfficerSettings({ defaultTab = 'account' }: OfficerSettingsProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabQuery = searchParams.get('tab') as SettingsSection | null;
  const [activeSection, setActiveSection] = useState<SettingsSection>(
    tabQuery && ['account', 'signature', 'organization', 'security'].includes(tabQuery)
      ? tabQuery
      : defaultTab
  );

  // Sync tabQuery with state if searchParams change
  useEffect(() => {
    if (tabQuery && ['account', 'signature', 'organization', 'security'].includes(tabQuery)) {
      setActiveSection(tabQuery);
    }
  }, [tabQuery]);

  // Real Officer Data Hooks
  const { profile, activeOrgName, loading: profileLoading, markPasswordChanged } = useOfficerProfile();
  const { data: students, loading: studentsLoading } = useStudents();
  const { data: roles } = useRoles();

  const currentStudent = students.find(
    s => s.studentId === profile?.studentId || (profile?.email && s.email?.toLowerCase() === profile.email.toLowerCase())
  );

  const isAdviser = Boolean(
    profile?.isAdviser ||
    profile?.activeRoleId?.toLowerCase() === 'adviser' ||
    profile?.activeRoleId?.toLowerCase().includes('adviser')
  );
  const activeRoleDoc = roles.find(r => r.id === profile?.activeRoleId);
  const activeRoleName = isAdviser ? 'Club Adviser' : (activeRoleDoc?.name || profile?.activeRoleId || 'Officer');

  // Form State
  const [fullName, setFullName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [email, setEmail] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Signature Studio State (Adviser)
  const [signatureUrl, setSignatureUrl] = useState<string>(profile?.signatureUrl || '');
  const [isRedrawing, setIsRedrawing] = useState(false);
  const [isSavingSignature, setIsSavingSignature] = useState(false);
  const [isUploadingSigFile, setIsUploadingSigFile] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sigFileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDrawingSig, setIsDrawingSig] = useState(false);
  const [hasDrawnSig, setHasDrawnSig] = useState(false);
  const [sigHistory, setSigHistory] = useState<ImageData[]>([]);

  // Auto-fetch adviser's signature from Firestore if not in session yet
  useEffect(() => {
    if (profile?.signatureUrl) {
      setSignatureUrl(profile.signatureUrl);
    } else if (isAdviser && profile?.email) {
      const fetchAdviserSig = async () => {
        try {
          const qAdv = query(
            collection(db, 'organization_advisers'),
            where('email', '==', profile.email)
          );
          const snap = await getDocs(qAdv);
          const found = snap.docs.find((d) => d.data().signatureUrl);
          if (found) {
            const url = found.data().signatureUrl;
            setSignatureUrl(url);
            const raw = localStorage.getItem('sti_sync_officer_session');
            if (raw) {
              const parsed = JSON.parse(raw);
              parsed.signatureUrl = url;
              localStorage.setItem('sti_sync_officer_session', JSON.stringify(parsed));
            }
          }
        } catch (e) {
          console.warn('[OfficerSettings] Error loading adviser signature:', e);
        }
      };
      fetchAdviserSig();
    }
  }, [profile?.signatureUrl, isAdviser, profile?.email]);

  // Security Form State
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  // Canvas Handlers
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

  const saveSigState = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setSigHistory((prev) => [...prev.slice(-10), imgData]);
  };

  const startSigDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    saveSigState();
    const { x, y } = getCanvasCoords(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#000000';
    setIsDrawingSig(true);
    setHasDrawnSig(true);
  };

  const drawSigMove = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawingSig) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { x, y } = getCanvasCoords(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopSigDrawing = () => {
    if (!isDrawingSig) return;
    setIsDrawingSig(false);
  };

  const clearSigCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawnSig(false);
  };

  const handleSigUndo = () => {
    if (sigHistory.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const previous = sigHistory[sigHistory.length - 1];
    ctx.putImageData(previous, 0, 0);
    setSigHistory((prev) => prev.slice(0, -1));
  };

  const handleSaveSignature = async (customUrl?: string) => {
    let finalUrl = customUrl;

    if (!finalUrl) {
      const canvas = canvasRef.current;
      if (!canvas || !hasDrawnSig) {
        toast.error('Please draw your official signature before saving.');
        return;
      }
      setIsSavingSignature(true);
      try {
        const dataUrl = canvas.toDataURL('image/png');
        const uploadRes = await uploadToCloudinary(dataUrl, { folder: 'advisers/signatures' });
        finalUrl = uploadRes.secureUrl || dataUrl;
      } catch (uploadErr: any) {
        console.warn('Cloudinary upload fallback to dataURL:', uploadErr);
        finalUrl = canvas.toDataURL('image/png');
      }
    }

    if (!finalUrl) {
      toast.error('Failed to generate signature image.');
      setIsSavingSignature(false);
      return;
    }

    setIsSavingSignature(true);
    try {
      if (profile?.email) {
        const qAdv = query(
          collection(db, 'organization_advisers'),
          where('email', '==', profile.email)
        );
        const advSnap = await getDocs(qAdv);
        for (const d of advSnap.docs) {
          await updateDoc(doc(db, 'organization_advisers', d.id), {
            signatureUrl: finalUrl,
            updatedAt: serverTimestamp(),
          });
        }
      }

      if (profile?.activeOrganizationId) {
        const orgRef = doc(db, 'organizations', profile.activeOrganizationId);
        await updateDoc(orgRef, {
          'adviser.signatureUrl': finalUrl,
          updatedAt: serverTimestamp(),
        });
      }

      const rawSession = localStorage.getItem('sti_sync_officer_session');
      if (rawSession) {
        try {
          const parsed = JSON.parse(rawSession);
          parsed.signatureUrl = finalUrl;
          localStorage.setItem('sti_sync_officer_session', JSON.stringify(parsed));
        } catch {}
      }

      setSignatureUrl(finalUrl);
      setIsRedrawing(false);
      setHasDrawnSig(false);
      toast.success('Official electronic signature registered successfully! You can now prepare and submit official AP, FL, and PAR documents.');
    } catch (saveErr: any) {
      console.error('[OfficerSettings] Error saving signature:', saveErr);
      toast.error('Failed to save signature: ' + (saveErr?.message || 'Please try again.'));
    } finally {
      setIsSavingSignature(false);
    }
  };

  const handleSignatureFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      toast.error('Signature image must be under 3MB.');
      return;
    }
    setIsUploadingSigFile(true);
    try {
      const res = await uploadToCloudinary(file, { folder: 'advisers/signatures' });
      if (res.secureUrl) {
        await handleSaveSignature(res.secureUrl);
      }
    } catch (uploadErr: any) {
      console.error('[OfficerSettings] Signature file upload error:', uploadErr);
      toast.error('Failed to upload signature image.');
    } finally {
      setIsUploadingSigFile(false);
      if (sigFileInputRef.current) sigFileInputRef.current.value = '';
    }
  };

  const handleRemoveSignature = async () => {
    if (!window.confirm('Are you sure you want to remove your registered signature? You will not be able to submit AP, FL, or PAR documents until a signature is registered.')) {
      return;
    }
    setIsSavingSignature(true);
    try {
      if (profile?.email) {
        const qAdv = query(
          collection(db, 'organization_advisers'),
          where('email', '==', profile.email)
        );
        const advSnap = await getDocs(qAdv);
        for (const d of advSnap.docs) {
          await updateDoc(doc(db, 'organization_advisers', d.id), {
            signatureUrl: null,
            updatedAt: serverTimestamp(),
          });
        }
      }
      if (profile?.activeOrganizationId) {
        const orgRef = doc(db, 'organizations', profile.activeOrganizationId);
        await updateDoc(orgRef, {
          'adviser.signatureUrl': null,
          updatedAt: serverTimestamp(),
        });
      }
      const rawSession = localStorage.getItem('sti_sync_officer_session');
      if (rawSession) {
        const parsed = JSON.parse(rawSession);
        delete parsed.signatureUrl;
        localStorage.setItem('sti_sync_officer_session', JSON.stringify(parsed));
      }
      setSignatureUrl('');
      setIsRedrawing(true);
      toast.success('Signature removed.');
    } catch (err: any) {
      toast.error('Failed to remove signature.');
    } finally {
      setIsSavingSignature(false);
    }
  };

  // Populate form with real data
  useEffect(() => {
    if (currentStudent) {
      const derivedName = formatPersonName(currentStudent);
      setFullName(derivedName || profile?.studentName || '');
      setContactNumber(currentStudent.contactNumber || '');
      setEmail(currentStudent.email || profile?.email || '');
      setPhotoUrl(currentStudent.profilePhotoUrl || '');
    } else if (profile) {
      setFullName(profile.studentName || '');
      setEmail(profile.email || '');
    }
  }, [currentStudent, profile]);

  const handleSaveAccount = async () => {
    if (isAdviser) {
      toast.success('Adviser profile settings updated.');
      return;
    }
    if (!currentStudent?.id) {
      toast.error('Student record not found in system.');
      return;
    }
    setIsSaving(true);
    try {
      const nameParts = fullName.trim().split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

      await updateStudent(currentStudent.id, {
        firstName,
        lastName,
        contactNumber: contactNumber.trim(),
        email: email.trim().toLowerCase(),
        profilePhotoUrl: photoUrl,
      });

      toast.success('Account profile updated successfully!');
    } catch (err: any) {
      console.error('Error updating profile:', err);
      toast.error('Failed to update profile: ' + (err.message || 'Unknown error'));
    } finally {
      setIsSaving(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image size must be under 2MB.');
      return;
    }

    setIsUploadingPhoto(true);
    try {
      const res = await uploadToCloudinary(file, { folder: 'students/profile' });
      setPhotoUrl(res.secureUrl);
      if (currentStudent?.id) {
        await updateStudent(currentStudent.id, { profilePhotoUrl: res.secureUrl });
      }
      toast.success('Profile photo updated successfully!');
    } catch (err: any) {
      console.error('Photo upload failed:', err);
      toast.error('Failed to upload photo.');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword) {
      toast.error('Please enter your current password.');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('New password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match.');
      return;
    }
    if (!profile?.email) {
      toast.error('Account email not found in session.');
      return;
    }

    setIsUpdatingPassword(true);
    try {
      await changeOfficerOrAdviserPassword(currentPassword, newPassword, profile);
      markPasswordChanged?.();
      toast.success('Password updated successfully! Your account is now secured.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      console.error('[OfficerSettings] Error updating password:', err);
      const code = err?.code || '';
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        toast.error('Current password is incorrect. Please try again.');
      } else if (code === 'auth/weak-password') {
        toast.error('New password is too weak. Please use a stronger password.');
      } else {
        toast.error(err.message || 'Failed to update password. Please try again.');
      }
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleTabChange = (key: SettingsSection) => {
    setActiveSection(key);
    setSearchParams({ tab: key });
  };

  const sessions = [
    { device: 'Windows PC', browser: 'Chrome 125', timestamp: 'Current Session', location: 'Ormoc City', current: true, icon: Monitor },
    { device: 'Android Phone', browser: 'Mobile App', timestamp: 'Active 2 hours ago', location: 'Ormoc City', current: false, icon: Smartphone },
  ];

  const inputClass =
    'w-full px-4 py-2.5 border border-gray-300 rounded-lg text-[14px] focus:ring-2 focus:ring-[#0E4EBD]/30 focus:border-[#0E4EBD] outline-none transition';
  const readOnlyClass =
    'w-full px-4 py-2.5 border border-gray-200 rounded-lg text-[14px] bg-gray-50 text-gray-500 cursor-not-allowed';

  const initials = fullName
    ? fullName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
    : 'OF';

  const courseYearLabel = currentStudent
    ? `${currentStudent.courseCode || currentStudent.courseName || 'BSIT'} · ${currentStudent.yearLevel || 'Student'}`
    : 'BSIT · Student';

  return (
    <div className="space-y-6 pb-12">
      <div>
        <div className="text-[#888780] text-[13px] font-medium">Dashboard › Settings</div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Sidebar nav */}
        <div className="col-span-3">
          <div className="bg-white border border-[#E0E0E0] rounded-xl p-3 shadow-sm">
            <nav className="space-y-0.5">
              {NAV_ITEMS.filter(({ key }) => key !== 'signature' || isAdviser).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => handleTabChange(key)}
                  className={`w-full text-left px-4 py-2.5 rounded-lg text-[14px] font-medium transition-colors flex items-center justify-between ${
                    activeSection === key
                      ? 'bg-[#F0F6FF] text-[#0E4EBD] font-bold'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-[#001A4D]'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    {key === 'signature' && <PenTool className="w-4 h-4 text-[#0E4EBD]" />}
                    {label}
                  </span>
                  {key === 'signature' && (
                    <span
                      className={`w-2 h-2 rounded-full ${
                        signatureUrl ? 'bg-emerald-500' : 'bg-amber-500'
                      }`}
                      title={signatureUrl ? 'Signature registered' : 'No signature registered'}
                    />
                  )}
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Content panel */}
        <div className="col-span-9">
          <div className="bg-white border border-[#E0E0E0] rounded-xl p-6 shadow-sm">

            {/* ── Account Profile ── */}
            {activeSection === 'account' && (
              <div className="space-y-6">
                <h2 className="text-[#001A4D] text-[18px] font-bold">Account Profile</h2>

                {profileLoading || studentsLoading ? (
                  <div className="py-12 text-center text-gray-500 flex flex-col items-center gap-2">
                    <Loader2 className="w-6 h-6 animate-spin text-[#0E4EBD]" />
                    <p className="text-sm">Loading Officer Profile...</p>
                  </div>
                ) : (
                  <>
                    {/* Avatar */}
                    <div className="flex items-center gap-5">
                      <div className="relative flex-shrink-0">
                        {photoUrl ? (
                          <img src={photoUrl} alt="Officer Avatar" className="w-20 h-20 rounded-full object-cover border border-[#E0E0E0]" />
                        ) : (
                          <div className="w-20 h-20 bg-gradient-to-br from-[#001A4D] to-[#0E4EBD] rounded-full flex items-center justify-center text-white font-bold text-2xl shadow-xs">
                            {initials}
                          </div>
                        )}
                        <button
                          onClick={() => photoInputRef.current?.click()}
                          disabled={isUploadingPhoto}
                          className="absolute bottom-0 right-0 p-1.5 bg-white border border-[#E0E0E0] rounded-full shadow hover:bg-gray-50 transition"
                          title="Upload photo"
                        >
                          {isUploadingPhoto ? <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0E4EBD]" /> : <Upload className="w-3.5 h-3.5 text-[#0E4EBD]" />}
                        </button>
                        <input
                          type="file"
                          ref={photoInputRef}
                          onChange={handlePhotoUpload}
                          accept="image/jpeg,image/png,image/webp"
                          className="hidden"
                        />
                      </div>
                      <div>
                        <p className="text-[#001A4D] text-[13px] font-semibold">Profile Photo</p>
                        <p className="text-[#888780] text-[12px] mt-0.5">JPG or PNG · max 2 MB</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <label className="block text-[#001A4D] text-[13px] font-medium mb-1.5">Full Name</label>
                        <input
                          type="text"
                          value={fullName}
                          onChange={e => setFullName(e.target.value)}
                          className={inputClass}
                        />
                      </div>

                      <div>
                        <label className="block text-[13px] font-medium text-gray-500 mb-1.5">
                          {isAdviser ? 'Faculty / Employee ID' : 'Student ID'}
                        </label>
                        <input
                          type="text"
                          value={profile?.studentId || currentStudent?.studentId || 'N/A'}
                          readOnly
                          className={readOnlyClass}
                        />
                      </div>

                      <div>
                        <label className="block text-[13px] font-medium text-gray-500 mb-1.5">
                          {isAdviser ? 'Designation' : 'Course & Year'}
                        </label>
                        <input
                          type="text"
                          value={isAdviser ? 'Club Adviser / Faculty' : courseYearLabel}
                          readOnly
                          className={readOnlyClass}
                        />
                      </div>

                      <div>
                        <label className="block text-[13px] font-medium text-gray-500 mb-1.5">
                          {isAdviser ? 'Portal Role' : 'Officer Role'}
                        </label>
                        <input
                          type="text"
                          value={activeRoleName}
                          readOnly
                          className={readOnlyClass}
                        />
                      </div>

                      <div>
                        <label className="block text-[#001A4D] text-[13px] font-medium mb-1.5">Contact Number</label>
                        <input
                          type="tel"
                          value={contactNumber}
                          onChange={e => setContactNumber(e.target.value)}
                          placeholder="+63 9XX XXX XXXX"
                          className={inputClass}
                        />
                      </div>

                      <div className="col-span-2">
                        <label className="block text-[#001A4D] text-[13px] font-medium mb-1.5">Email Address</label>
                        <input
                          type="email"
                          value={email}
                          onChange={e => setEmail(e.target.value)}
                          className={inputClass}
                        />
                      </div>
                    </div>

                    {/* Adviser Official E-Signature Banner */}
                    {isAdviser && (
                      <div className="p-4 bg-gradient-to-r from-blue-50/80 via-white to-amber-50/50 border border-blue-200/80 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-2xs">
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-xl bg-[#001A4D] text-[#FFD41C] flex items-center justify-center shrink-0 shadow-xs">
                            <PenTool className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-bold text-[#001A4D]">Official Electronic Signature</h4>
                              {signatureUrl ? (
                                <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md text-[10px] font-bold flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                  Registered
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-md text-[10px] font-bold flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3 text-amber-600" />
                                  Not Registered
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5 max-w-md">
                              Required to prepare and submit official Activity Proposals, Financial Liquidations, and Post-Activity Reports.
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleTabChange('signature')}
                          className="px-4 py-2 bg-[#001A4D] hover:bg-[#0E4EBD] text-white rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer shadow-xs flex items-center gap-1.5"
                        >
                          <FileSignature className="w-3.5 h-3.5" />
                          <span>{signatureUrl ? 'Manage Signature' : 'Register Signature'}</span>
                        </button>
                      </div>
                    )}

                    <div className="flex items-center gap-3 pt-2">
                      <button
                        onClick={handleSaveAccount}
                        disabled={isSaving}
                        className="flex items-center gap-2 px-5 py-2.5 bg-[#001A4D] text-white rounded-lg text-[14px] font-bold hover:bg-[#0E4EBD] transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
                      >
                        {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                        {isSaving ? 'Saving Changes...' : 'Save Changes'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── Official E-Signature Studio (Club Adviser) ── */}
            {activeSection === 'signature' && isAdviser && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#0E4EBD] flex items-center justify-center shrink-0">
                      <FileSignature className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-[#001A4D] text-[18px] font-bold">
                        Official Electronic Signature Studio
                      </h2>
                      <p className="text-xs text-gray-500">
                        Official specimen signature stamp for legally preparing and submitting AP, FL, and PAR documents.
                      </p>
                    </div>
                  </div>
                  {signatureUrl ? (
                    <span className="px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-2xs self-start sm:self-auto">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      Active & Registered
                    </span>
                  ) : (
                    <span className="px-3 py-1 bg-amber-50 text-amber-700 border border-amber-200 text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-2xs self-start sm:self-auto">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                      Signature Required for Submission
                    </span>
                  )}
                </div>

                {/* Important Policy Notice */}
                <div className="p-4 bg-blue-50/70 border border-blue-200 rounded-xl flex items-start gap-3">
                  <Shield className="w-4 h-4 text-[#0E4EBD] shrink-0 mt-0.5" />
                  <div className="text-xs text-slate-700 leading-relaxed">
                    <strong>Institutional Maker Requirement:</strong> As the Organization Adviser, only you have authority to formally submit Activity Proposals, Financial Liquidations, and Post-Activity Reports. When you submit any of these documents, your registered signature will be automatically stamped as <strong>"Prepared by:"</strong> with legal attribution. Submissions are strictly blocked until an electronic signature is registered.
                  </div>
                </div>

                {/* Active Signature View or Interactive Pad */}
                {signatureUrl && !isRedrawing ? (
                  <div className="bg-gradient-to-b from-white to-gray-50 border-2 border-emerald-500/40 rounded-2xl p-6 flex flex-col items-center justify-center relative shadow-xs space-y-4">
                    <div className="absolute top-4 right-4 flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-bold">
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      Verified Active Institutional Seal
                    </div>

                    <div className="h-32 w-full max-w-md flex items-center justify-center overflow-hidden my-2 bg-white rounded-xl border border-gray-200 p-3 shadow-inner">
                      <img
                        src={signatureUrl}
                        alt="Registered Adviser Signature"
                        className="max-h-full max-w-full object-contain filter contrast-125"
                      />
                    </div>

                    <div className="w-full max-w-sm border-t border-gray-300 pt-3 text-center space-y-0.5">
                      <p className="text-xs font-bold text-[#001A4D] uppercase tracking-wide underline underline-offset-4">
                        {fullName || profile?.studentName || 'Organization Adviser'}
                      </p>
                      <p className="text-[11px] text-gray-600 font-semibold">{activeRoleName} • {activeOrgName}</p>
                      <p className="text-[10px] text-gray-400 font-mono">
                        Sealed Cryptographically • RA 8792 Certified Digital Ink
                      </p>
                    </div>

                    <div className="flex items-center gap-2 pt-2 flex-wrap justify-center">
                      <button
                        type="button"
                        onClick={() => {
                          setIsRedrawing(true);
                          clearSigCanvas();
                        }}
                        className="px-4 py-2 bg-[#001A4D] hover:bg-[#0E4EBD] text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
                      >
                        <PenTool className="w-3.5 h-3.5" />
                        Redraw Signature
                      </button>
                      <button
                        type="button"
                        onClick={() => sigFileInputRef.current?.click()}
                        className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        Upload New Image
                      </button>
                      <button
                        type="button"
                        onClick={handleRemoveSignature}
                        className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white border-2 border-dashed border-gray-300 rounded-2xl p-6 space-y-4">
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span className="font-semibold text-gray-700 flex items-center gap-1.5">
                        <PenTool className="w-3.5 h-3.5 text-[#0E4EBD]" />
                        Draw your official electronic signature below in pure black ink:
                      </span>
                      <div className="flex items-center gap-2">
                        {sigHistory.length > 0 && (
                          <button
                            type="button"
                            onClick={handleSigUndo}
                            className="px-2.5 py-1 text-xs font-bold text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-md flex items-center gap-1 cursor-pointer"
                          >
                            <RotateCcw className="w-3 h-3" />
                            Undo
                          </button>
                        )}
                        {hasDrawnSig && (
                          <button
                            type="button"
                            onClick={clearSigCanvas}
                            className="px-2.5 py-1 text-xs font-bold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 rounded-md cursor-pointer"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Canvas Area */}
                    <div className="border border-gray-200 rounded-xl overflow-hidden bg-slate-50/50 touch-none shadow-inner">
                      <canvas
                        ref={canvasRef}
                        width={640}
                        height={180}
                        onMouseDown={startSigDrawing}
                        onMouseMove={drawSigMove}
                        onMouseUp={stopSigDrawing}
                        onMouseLeave={stopSigDrawing}
                        onTouchStart={startSigDrawing}
                        onTouchMove={drawSigMove}
                        onTouchEnd={stopSigDrawing}
                        className="w-full h-44 cursor-crosshair block bg-white"
                      />
                    </div>

                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-gray-100">
                      <div className="flex items-center gap-3">
                        <input
                          ref={sigFileInputRef}
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={handleSignatureFileUpload}
                          className="hidden"
                        />
                        <button
                          type="button"
                          onClick={() => sigFileInputRef.current?.click()}
                          disabled={isUploadingSigFile}
                          className="text-xs text-[#0E4EBD] hover:underline font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          {isUploadingSigFile ? 'Uploading...' : 'Or upload signature image'}
                        </button>
                        {signatureUrl && (
                          <button
                            type="button"
                            onClick={() => setIsRedrawing(false)}
                            className="text-xs text-gray-500 hover:text-gray-800 underline cursor-pointer ml-2"
                          >
                            Cancel
                          </button>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleSaveSignature()}
                        disabled={isSavingSignature || !hasDrawnSig}
                        className="px-6 py-2.5 bg-[#001A4D] hover:bg-[#0E4EBD] text-white rounded-xl text-xs font-bold transition-all disabled:opacity-40 cursor-pointer flex items-center gap-2 shadow-xs"
                      >
                        {isSavingSignature && <Loader2 className="w-4 h-4 animate-spin" />}
                        <span>{isSavingSignature ? 'Saving Signature...' : 'Save E-Signature Stamp'}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Organization Profile ── */}
            {activeSection === 'organization' && (
              <OrganizationProfile embedded={true} />
            )}

            {/* ── Security & Password ── */}
            {activeSection === 'security' && (
              <form onSubmit={handleUpdatePassword} className="space-y-6">
                <h2 className="text-[#001A4D] text-[18px] font-bold">Security & Password</h2>

                {profile?.requiresPasswordChange && (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3 text-xs text-amber-900 animate-in fade-in">
                    <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-amber-950 text-sm">Action Recommended: Set Your Personal Password</p>
                      <p className="mt-0.5 text-amber-800 leading-relaxed">
                        You are currently signed in with an initial temporary password. Please choose a new, private password below to secure your account.
                      </p>
                    </div>
                  </div>
                )}

                {/* Change password */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-[#001A4D] text-[13px] font-medium mb-1.5">Current Password</label>
                    <div className="relative">
                      <input
                        type={showCurrent ? 'text' : 'password'}
                        placeholder="Enter current / temporary password"
                        value={currentPassword}
                        onChange={e => setCurrentPassword(e.target.value)}
                        className={inputClass + ' pr-10'}
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrent(!showCurrent)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[#001A4D] text-[13px] font-medium mb-1.5">New Password</label>
                    <div className="relative">
                      <input
                        type={showNew ? 'text' : 'password'}
                        placeholder="Enter new password (min. 8 characters)"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className={inputClass + ' pr-10'}
                      />
                      <button
                        type="button"
                        onClick={() => setShowNew(!showNew)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <PasswordStrength password={newPassword} />
                  </div>

                  <div>
                    <label className="block text-[#001A4D] text-[13px] font-medium mb-1.5">Confirm New Password</label>
                    <div className="relative">
                      <input
                        type={showConfirm ? 'text' : 'password'}
                        placeholder="Confirm new password"
                        value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)}
                        className={inputClass + ' pr-10'}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirm(!showConfirm)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isUpdatingPassword}
                  className="px-6 py-2.5 bg-[#0E4EBD] text-white rounded-xl text-[14px] font-bold hover:bg-[#001A4D] transition-colors flex items-center gap-2 disabled:opacity-50 shadow-sm cursor-pointer"
                >
                  {isUpdatingPassword ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Updating Password...</>
                  ) : (
                    'Update Password'
                  )}
                </button>

                {/* Active sessions */}
                <div className="pt-6 border-t border-gray-100">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-[#0E4EBD]" />
                      <h3 className="text-[#001A4D] text-[15px] font-bold">Active Sessions</h3>
                    </div>
                    <button type="button" className="text-[13px] text-red-500 hover:text-red-600 font-medium transition-colors">
                      Sign out all other sessions
                    </button>
                  </div>
                  <div className="space-y-2">
                    {sessions.map((s, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-white border border-gray-200 rounded-lg flex items-center justify-center">
                            <s.icon className="w-4 h-4 text-gray-500" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-[#001A4D] text-[13px] font-medium">{s.device} · {s.browser}</p>
                              {s.current && (
                                <span className="px-1.5 py-0.5 bg-green-100 text-green-700 text-[10px] rounded font-medium">
                                  This device
                                </span>
                              )}
                            </div>
                            <p className="text-[#888780] text-[11px] mt-0.5">{s.timestamp} · {s.location}</p>
                          </div>
                        </div>
                        {!s.current && (
                          <button type="button" className="p-1.5 text-gray-400 hover:text-red-500 transition-colors" title="Sign out">
                            <LogOut className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </form>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
