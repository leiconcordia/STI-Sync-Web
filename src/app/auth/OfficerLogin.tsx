import { useState } from 'react';
import { useNavigate } from 'react-router';
import { IdCard, Lock, Eye, EyeOff, LogIn, AlertCircle, Info, KeyRound, X, CheckCircle2, Send } from 'lucide-react';
import stiOrmocLogo from '../../imports/STI_ORMOC_LOGO.jpg';
import stiSchoolPic from '../../imports/STI_SCHOOL_PIC.webp';

import { useOfficerAuth } from './hooks/useOfficerAuth';
import { submitPasswordResetRequest } from './services/password-reset-request.service';

export default function OfficerLogin() {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const { login, isLoggingIn, error } = useOfficerAuth();

  // Forgot Password Request Modal State
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [resetIdentifier, setResetIdentifier] = useState('');
  const [isSubmittingReset, setIsSubmittingReset] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState(false);

  const openForgotModal = () => {
    setResetIdentifier(identifier.trim());
    setResetError('');
    setResetSuccess(false);
    setShowForgotModal(true);
  };

  const handleSubmitResetRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetIdentifier.trim()) {
      setResetError('Please enter your Student ID, Employee ID, or institutional email.');
      return;
    }
    setIsSubmittingReset(true);
    setResetError('');
    try {
      await submitPasswordResetRequest({
        identifier: resetIdentifier,
      });
      setResetSuccess(true);
    } catch (err: any) {
      setResetError(err?.message || 'Unable to send reset request. Please try again.');
    } finally {
      setIsSubmittingReset(false);
    }
  };

  const handleLogin = async () => {
    if (!identifier.trim() || !password.trim()) return;

    const res = await login(identifier, password);
    if (res && res.success) {
      navigate(res.redirectPath || '/officer/dashboard');
    }
  };

  return (
    <div className="h-screen w-full flex overflow-hidden">
      {/* Left Panel - Campus Photo Showcase with Top Text & Unobscured STI COLLEGE Building */}
      <div className="w-1/2 h-full bg-[#001A4D] relative overflow-hidden flex flex-col justify-between p-8 lg:p-12">
        {/* Full Height Campus Photo Background */}
        <div className="absolute inset-0 z-0">
          <img
            src={stiSchoolPic}
            alt="STI College Ormoc Campus"
            className="w-full h-full object-cover object-center filter contrast-105 saturate-110"
          />
          {/* Vignette overlays: Darker at top for text readability, subtle gradient at bottom, center wide open for STI COLLEGE building facade */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#001A4D]/90 via-black/15 to-[#001A4D]/80" />
        </div>

        {/* Ambient Glows */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
          <div className="w-[600px] h-[600px] bg-[#0E4EBD] opacity-20 rounded-full blur-[150px]" />
          <div className="absolute w-[400px] h-[400px] bg-[#FFD41C] opacity-15 rounded-full blur-[120px] translate-x-20" />
        </div>

        {/* Top Section: Redesigned Student Affairs Services Badge & Clean Header */}
        <div className="relative z-10 max-w-[480px]">
          <div className="inline-flex items-center gap-2.5 bg-gradient-to-r from-[#001A4D]/90 via-[#0A2E6D]/90 to-[#001A4D]/90 backdrop-blur-xl border border-white/20 text-[#FFD41C] text-[12px] font-black uppercase px-4 py-1.5 rounded-full tracking-wider shadow-lg shadow-black/20">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FFD41C] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#FFD41C]"></span>
            </span>
            Student Affairs Services · Campus Portal
          </div>
          <h1 className="text-white text-[32px] lg:text-[40px] font-black tracking-tight leading-tight mt-3">
            Connect, Participate, <br />
            <span className="text-[#FFD41C]">and Stay Updated.</span>
          </h1>
        </div>

        {/* Middle Area Left Empty for Unobscured STI COLLEGE Building View */}
        <div className="flex-1 pointer-events-none" />

        {/* Bottom space intentionally clean (duplicate footer removed) */}
        <div className="relative z-10 h-6" />
      </div>

      {/* Right Panel - Single Viewport Fit Login Form with Redesigned Enlarged STI_ORMOC_LOGO */}
      <div className="w-1/2 h-full bg-white flex items-center justify-center p-6 lg:p-10 overflow-hidden">
        <div className="w-full max-w-[480px]">
          {/* Logo Header Section - Circle Framed Logo */}
          <div className="text-center mb-6">
            <div className="inline-block relative mb-3 group">
              <div className="absolute -inset-1.5 bg-gradient-to-r from-[#FFD41C] via-[#0E4EBD] to-[#FFD41C] rounded-full blur-md opacity-40 group-hover:opacity-70 transition duration-500" />
              <div className="relative w-28 h-28 md:w-32 md:h-32 rounded-full overflow-hidden shadow-xl mx-auto flex items-center justify-center transition-transform duration-300 group-hover:scale-[1.03]">
                <img
                  src={stiOrmocLogo}
                  alt="STI College Ormoc Logo"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>

            <h2 className="text-[#001A4D] text-[28px] md:text-[30px] font-black tracking-tight">
              STI Sync Portal
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              Organization Officers & Institutional Signatories
            </p>
          </div>

          <div className="h-px bg-[#E5E7EB] mb-5" />

          {/* Form Fields */}
          <div className="space-y-4 mb-4">
            {/* Username/ID Field */}
            <div>
              <label className="block text-[#001A4D] text-[13px] font-bold mb-1.5">
                Email, Employee ID, or Student ID
              </label>
              <div className="relative">
                <IdCard className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  placeholder="Enter your institutional email, employee or student ID"
                  className="w-full h-[48px] pl-10 pr-4 border border-gray-300 rounded-xl text-[14px] focus:border-[#0E4EBD] focus:ring-2 focus:ring-[#0E4EBD]/20 outline-none transition-all"
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label className="block text-[#001A4D] text-[13px] font-bold mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  placeholder="Enter your password"
                  className="w-full h-[48px] pl-10 pr-10 border border-gray-300 rounded-xl text-[14px] focus:border-[#0E4EBD] focus:ring-2 focus:ring-[#0E4EBD]/20 outline-none transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* Forgot Password */}
          <div className="text-right mb-4">
            <button
              type="button"
              onClick={openForgotModal}
              className="text-[#0E4EBD] text-[13px] font-semibold hover:underline cursor-pointer"
            >
              Forgot Password?
            </button>
          </div>

          {/* Login Button */}
          <button
            onClick={handleLogin}
            disabled={isLoggingIn || !identifier.trim() || !password.trim()}
            className="w-full h-[48px] bg-gradient-to-r from-[#0E4EBD] to-[#1E70E8] text-white rounded-xl font-bold text-[15px] flex items-center justify-center gap-2 hover:opacity-95 active:scale-[0.99] transition-all shadow-md disabled:opacity-70 cursor-pointer"
          >
            {isLoggingIn ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Signing in...</span>
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                Sign In to Organization Portal
              </>
            )}
          </button>

          {/* Error State */}
          {error && (
            <div className="mt-3 bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-red-700 text-[13px] font-medium">{error}</p>
            </div>
          )}

          {/* Portal Access Note */}
          <div className="mt-4 bg-gradient-to-r from-blue-50/80 to-slate-50 border border-blue-200/70 rounded-xl p-3.5 flex items-start gap-3 shadow-xs">
            <Info className="w-4 h-4 text-[#001A4D] flex-shrink-0 mt-0.5" />
            <p className="text-[12px] leading-relaxed">
              <span className="text-[#001A4D] font-bold">Portal Access Notice: </span>
              <span className="text-[#4B5563] font-medium">
                Accounts for student officers, club advisers, and institutional signatories are appointed and managed by the SAS Administration directly.
              </span>
            </p>
          </div>

          {/* Footer */}
          <div className="mt-4 text-center">
            <p className="text-[#9CA3AF] text-[11px]">
              © 2026 STI College Ormoc · Student Affairs Services
            </p>
          </div>
        </div>
      </div>

      {/* Forgot Password Request Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-gray-200 overflow-hidden">
            <div className="bg-[#001A4D] px-5 py-4 flex items-center justify-between text-white">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center text-[#FFD41C]">
                  <KeyRound className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">Request Password Reset</h3>
                  <p className="text-[11px] text-blue-100/80">
                    SAS Administration will be notified to reset your account
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowForgotModal(false)}
                className="p-1.5 rounded-lg text-white/75 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {resetSuccess ? (
              <div className="p-6 text-center space-y-4">
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-bold text-[#001A4D] text-base">Reset Request Sent to SAS</h4>
                  <p className="text-xs text-gray-600 mt-1.5 leading-relaxed">
                    Your password reset request for <strong className="text-gray-900">{resetIdentifier}</strong> has been sent to the SAS Administration. Once reset, your new temporary password will be issued by SAS.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowForgotModal(false)}
                  className="w-full py-2.5 rounded-xl bg-[#001A4D] hover:bg-[#0E4EBD] text-white text-xs font-bold transition-colors cursor-pointer"
                >
                  Back to Portal Login
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmitResetRequest} className="p-5 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-[#001A4D] mb-1.5">
                    Student / Employee ID or Institutional Email *
                  </label>
                  <input
                    type="text"
                    value={resetIdentifier}
                    onChange={(e) => setResetIdentifier(e.target.value)}
                    placeholder="e.g., 20001234567 or name@ormoc.sti.edu.ph"
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-xs focus:border-[#0E4EBD] focus:ring-2 focus:ring-[#0E4EBD]/20 outline-none"
                    required
                  />
                </div>

                {resetError && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-2.5 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <p className="text-xs text-red-700 font-medium">{resetError}</p>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setShowForgotModal(false)}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingReset || !resetIdentifier.trim()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-[#0E4EBD] hover:bg-[#001A4D] text-white transition-colors disabled:opacity-60 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {isSubmittingReset ? 'Sending...' : 'Notify SAS Admin'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export { OfficerLogin as PortalLogin };
