import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Mail, Lock, Eye, EyeOff, LogIn, AlertCircle, ShieldCheck } from 'lucide-react';
import stiSyncLogo from '../../imports/STI_SYNC_LOGO.jpg';
import { signInAdviser, getAdviserProfile } from '../modules/auth';

// ─── Firebase Auth error code → human-readable message map ───────────────────
function resolveAuthError(code: string): string {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Invalid email or password. Please try again.';
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Please wait a moment and try again.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Contact your administrator.';
    case 'auth/network-request-failed':
      return 'Network error. Please check your connection and try again.';
    default:
      return 'Sign-in failed. Please try again.';
  }
}

export default function SASAdminLogin() {
  const navigate = useNavigate();

  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading]     = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // ─── Handle sign-in ────────────────────────────────────────────────────────
  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsLoading(true);

    try {
      // 1. Authenticate with Firebase Auth
      const credential = await signInAdviser(email.trim(), password);
      const uid = credential.user.uid;

      // 2. Verify the user has a profile in /sas_admins
      //    (ensures only registered advisers can access the admin portal)
      const profile = await getAdviserProfile(uid);
      if (!profile) {
        // Auth succeeded but no Firestore profile — reject access
        setErrorMessage(
          'No admin profile found for this account. Contact your system administrator.'
        );
        setIsLoading(false);
        return;
      }

      if (!profile.isActive) {
        setErrorMessage('Your account has been deactivated. Contact your system administrator.');
        setIsLoading(false);
        return;
      }

      // 3. Profile verified — navigate to admin dashboard
      navigate('/home');
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? '';
      setErrorMessage(resolveAuthError(code));
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Branding (Identical to Landing Page) */}
      <div className="w-1/2 bg-[#001A4D] relative overflow-hidden flex items-center justify-center">
        {/* Gradient Glows */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-[600px] h-[600px] bg-[#83358E] opacity-15 rounded-full blur-[150px]" />
          <div className="absolute w-[400px] h-[400px] bg-[#FFD41C] opacity-8 rounded-full blur-[120px] translate-x-24" />
        </div>

        {/* Content */}
        <div className="relative z-10 text-center px-16">
          {/* Logo Block */}
          <div className="mb-12">
            <img src={stiSyncLogo} alt="STI Sync" className="w-40 h-40 mx-auto mb-4 object-cover rounded-2xl" />
            <h1 className="text-white text-[40px] font-bold tracking-tight mb-3">STI Sync</h1>
            <div className="w-12 h-0.5 bg-[#FFD41C] mx-auto mb-3" />
            <p className="text-[#FFD41C] text-[15px] font-light uppercase tracking-wider mb-2">
              Student Affairs Services
            </p>
            <p className="text-white text-[12px] opacity-60">STI College Ormoc</p>
          </div>

          <div className="max-w-[360px] mx-auto">
            <h2 className="text-white text-[32px] font-bold leading-tight mb-1">
              Connect, Participate,
            </h2>
            <h2 className="text-[#FFD41C] text-[32px] font-bold leading-tight mb-3">
              and Stay Updated.
            </h2>
            <p className="text-white text-[15px] opacity-70 leading-relaxed">
              Your complete campus management platform for events, attendance, and organizational finance.
            </p>
          </div>

          <div className="absolute bottom-8 left-0 right-0">
            <p className="text-white text-[11px] opacity-40">
              STI Sync · v1.0.0 · STI College Ormoc
            </p>
          </div>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="w-1/2 bg-white flex items-center justify-center px-16">
        <div className="w-full max-w-[480px]">
          {/* Back Navigation */}
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-[#001A4D] text-[14px] mb-8 hover:text-[#83358E] transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Welcome
          </button>

          {/* Form Header */}
          <div className="flex gap-3 mb-6">
            <div className="w-1 bg-[#FFD41C] rounded-full" />
            <div>
              <h2 className="text-[#001A4D] text-[28px] font-bold mb-1">SAS Admin Login</h2>
              <p className="text-[#9E9E9E] text-[14px] mb-1">
                Student Affairs Services — SAO Adviser Portal
              </p>
              <p className="text-[#83358E] text-[13px] italic">Authorized personnel only.</p>
            </div>
          </div>

          <div className="h-px bg-[#E0E0E0] mb-6" />

          {/* Form */}
          <form onSubmit={handleLogin}>
            <div className="space-y-6 mb-4">
              {/* Email Field */}
              <div>
                <label htmlFor="sas-email" className="block text-[#001A4D] text-[13px] font-bold mb-2">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-gray-400" />
                  <input
                    id="sas-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="adviser@sti.edu.ph"
                    required
                    autoComplete="email"
                    className="w-full h-[52px] pl-12 pr-4 border border-[#E0E0E0] rounded-lg text-[14px] focus:border-[#83358E] focus:ring-2 focus:ring-[#83358E]/20 outline-none transition-all"
                  />
                </div>
              </div>

              {/* Password Field */}
              <div>
                <label htmlFor="sas-password" className="block text-[#001A4D] text-[13px] font-bold mb-2">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-gray-400" />
                  <input
                    id="sas-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                    autoComplete="current-password"
                    className="w-full h-[52px] pl-12 pr-12 border border-[#E0E0E0] rounded-lg text-[14px] focus:border-[#83358E] focus:ring-2 focus:ring-[#83358E]/20 outline-none transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Forgot Password */}
            <div className="text-right mb-6">
              <button type="button" className="text-[#83358E] text-[13px] hover:underline">
                Forgot Password?
              </button>
            </div>

            {/* Login Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-[52px] bg-[#001A4D] text-[#FFD41C] rounded-lg font-bold text-[15px] flex items-center justify-center gap-2 hover:bg-[#0C3C8A] transition-colors disabled:opacity-70"
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span className="text-white">Signing in...</span>
                </>
              ) : (
                <>
                  <LogIn className="w-[18px] h-[18px]" />
                  Sign In
                </>
              )}
            </button>
          </form>

          {/* Error State */}
          {errorMessage && (
            <div className="mt-4 bg-[#EF4444]/8 border border-[#EF4444] rounded-lg p-3 flex items-start gap-3">
              <AlertCircle className="w-[18px] h-[18px] text-[#EF4444] flex-shrink-0 mt-0.5" />
              <p className="text-[#EF4444] text-[13px]">{errorMessage}</p>
            </div>
          )}

          {/* Divider */}
          <div className="relative my-6">
            <div className="h-px bg-[#E0E0E0]" />
            <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white px-3 text-[#9E9E9E] text-[11px] uppercase">
              Portal Access Only
            </span>
          </div>

          {/* Security Notice */}
          <div className="bg-[#F8F8F8] border border-[#E0E0E0] rounded-lg p-3.5 flex items-start gap-3">
            <ShieldCheck className="w-[18px] h-[18px] text-[#0E4EBD] flex-shrink-0 mt-0.5" />
            <p className="text-[#9E9E9E] text-[12px] leading-relaxed">
              This portal is restricted to authorized SAO Advisers of STI College Ormoc. Unauthorized access attempts are logged.
            </p>
          </div>

          {/* Footer */}
          <div className="mt-8 text-center">
            <p className="text-[#9E9E9E] text-[11px]">
              © 2026 STI College Ormoc · Student Affairs Services
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
