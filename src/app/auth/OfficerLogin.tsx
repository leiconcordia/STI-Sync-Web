import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, IdCard, Lock, Eye, EyeOff, LogIn, AlertCircle, Info } from 'lucide-react';
import stiSyncLogo from '../../imports/STI_SYNC_LOGO.jpg';

import { useOfficerAuth } from './hooks/useOfficerAuth';

export default function OfficerLogin() {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const { login, isLoggingIn, error } = useOfficerAuth();

  const handleLogin = async () => {
    if (!identifier.trim() || !password.trim()) return;
    
    const success = await login(identifier, password);
    if (success) {
      navigate('/officer/dashboard');
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
            <div className="w-1 bg-[#0E4EBD] rounded-full" />
            <div>
              <h2 className="text-[#001A4D] text-[28px] font-bold mb-1">Officer Login</h2>
              <p className="text-[#9E9E9E] text-[14px] mb-1">
                Student Organization Officer Portal
              </p>
              <p className="text-[#9E9E9E] text-[13px] italic">Sign in with your STI Sync officer credentials.</p>
            </div>
          </div>

          <div className="h-px bg-[#E0E0E0] mb-6" />

          {/* Form Fields */}
          <div className="space-y-6 mb-4">
            {/* Username/ID Field */}
            <div>
              <label className="block text-[#001A4D] text-[13px] font-bold mb-2">Username or Student ID</label>
              <div className="relative">
                <IdCard className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-gray-400" />
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  placeholder="Enter your username or student ID"
                  className="w-full h-[52px] pl-12 pr-4 border border-[#E0E0E0] rounded-lg text-[14px] focus:border-[#0E4EBD] focus:ring-2 focus:ring-[#0E4EBD]/20 outline-none transition-all"
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label className="block text-[#001A4D] text-[13px] font-bold mb-2">Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  placeholder="Enter your password"
                  className="w-full h-[52px] pl-12 pr-12 border border-[#E0E0E0] rounded-lg text-[14px] focus:border-[#0E4EBD] focus:ring-2 focus:ring-[#0E4EBD]/20 outline-none transition-all"
                />
                <button
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
            <button className="text-[#0E4EBD] text-[13px] hover:underline">Forgot Password?</button>
          </div>

          {/* Login Button */}
          <button
            onClick={handleLogin}
            disabled={isLoggingIn || !identifier.trim() || !password.trim()}
            className="w-full h-[52px] bg-gradient-to-r from-[#0E4EBD] to-[#1E70E8] text-white rounded-lg font-bold text-[15px] flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-70"
          >
            {isLoggingIn ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Signing in...
              </>
            ) : (
              <>
                <LogIn className="w-[18px] h-[18px]" />
                Sign In
              </>
            )}
          </button>

          {/* Error State */}
          {error && (
            <div className="mt-4 bg-[#EF4444]/8 border border-[#EF4444] rounded-lg p-3 flex items-start gap-3">
              <AlertCircle className="w-[18px] h-[18px] text-[#EF4444] flex-shrink-0 mt-0.5" />
              <p className="text-[#EF4444] text-[13px]">{error}</p>
            </div>
          )}

          {/* Officer Registration Note */}
          <div className="mt-6 bg-[#F3E8FF] border border-[#83358E] rounded-lg p-3.5">
            <div className="flex items-start gap-3 mb-2">
              <Info className="w-[18px] h-[18px] text-[#83358E] flex-shrink-0 mt-0.5" />
              <p className="text-[#83358E] text-[13px] leading-relaxed">
                Don't have an officer account? Contact your SAO Adviser to get your credentials.
              </p>
            </div>
            <p className="text-[#9E9E9E] text-[12px] leading-relaxed ml-7">
              Officer accounts are created and managed by the SAO Adviser directly.
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
