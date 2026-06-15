import { useNavigate } from "react-router";
import { Shield, Lock, ChevronRight, Info } from "lucide-react";
import stiSyncLogo from '../../imports/STI_SYNC_LOGO.jpg';

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Branding */}
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
            {/* Logo Mark */}
            <img
              src={stiSyncLogo}
              alt="STI Sync"
              className="w-40 h-40 mx-auto mb-4 object-cover rounded-2xl"
            />

            {/* Wordmark */}
            <h1 className="text-white text-[40px] font-bold tracking-tight mb-3">
              STI Sync
            </h1>

            {/* Divider */}
            <div className="w-12 h-0.5 bg-[#FFD41C] mx-auto mb-3" />

            {/* Subtitle */}
            <p className="text-[#FFD41C] text-[15px] font-light uppercase tracking-wider mb-2">
              Student Affairs Services
            </p>
            <p className="text-white text-[12px] opacity-60">
              STI College Ormoc
            </p>
          </div>

          {/* Welcome Copy */}
          <div className="max-w-[360px] mx-auto">
            <h2 className="text-white text-[32px] font-bold leading-tight mb-1">
              Connect, Participate,
            </h2>
            <h2 className="text-[#FFD41C] text-[32px] font-bold leading-tight mb-3">
              and Stay Updated.
            </h2>
            <p className="text-white text-[15px] opacity-70 leading-relaxed">
              Your complete campus management platform for
              events, attendance, and organizational finance.
            </p>
          </div>

          {/* Bottom Version */}
          <div className="absolute bottom-8 left-0 right-0">
            <p className="text-white text-[11px] opacity-40">
              STI Sync · v1.0.0 · STI College Ormoc
            </p>
          </div>
        </div>
      </div>

      {/* Right Panel - Portal Selection */}
      <div className="w-1/2 bg-white flex items-center justify-center px-16">
        <div className="w-full max-w-[520px]">
          {/* Header */}
          <div className="mb-8">
            <h2 className="text-[#001A4D] text-[28px] font-bold mb-2">
              Welcome Back
            </h2>
            <p className="text-[#9E9E9E] text-[14px]">
              Select your portal to continue.
            </p>
            <div className="mt-6 h-px bg-[#E0E0E0]" />
          </div>

          {/* Portal Cards */}
          <div className="space-y-4 mb-6">
            {/* Officer Portal */}
            <button
              onClick={() => navigate("/officer/login")}
              className="w-full h-[88px] bg-white border border-[#E0E0E0] rounded-2xl px-6 flex items-center gap-4 hover:border-[#0E4EBD] hover:border-2 hover:bg-[#0E4EBD]/5 transition-all group"
            >
              <div className="w-14 h-14 bg-[#0E4EBD]/10 rounded-xl flex items-center justify-center flex-shrink-0">
                <Shield className="w-6 h-6 text-[#0E4EBD]" />
              </div>
              <div className="flex-1 text-left">
                <h3 className="text-[#001A4D] text-[16px] font-bold mb-1">
                  Officer Login
                </h3>
                <p className="text-[#9E9E9E] text-[13px]">
                  Manage events, attendance, and financial
                  liquidations
                </p>
              </div>
              <ChevronRight className="w-5 h-5 text-[#0E4EBD] group-hover:translate-x-1 transition-transform" />
            </button>

            {/* SAS Admin Portal */}
            <button
              onClick={() => navigate("/admin/login")}
              className="w-full h-[72px] bg-white border border-[#E0E0E0] rounded-2xl px-6 flex items-center gap-4 hover:border-[#FFD41C] hover:border-2 hover:bg-[#FFD41C]/5 transition-all group"
            >
              <div className="w-12 h-12 bg-[#FFD41C]/12 rounded-xl flex items-center justify-center flex-shrink-0">
                <Lock className="w-5 h-5 text-[#FFD41C]" />
              </div>
              <div className="flex-1 text-left">
                <h3 className="text-[#001A4D] text-[15px] font-bold mb-0.5">
                  SAS Admin Login
                </h3>
                <p className="text-[#9E9E9E] text-[12px]">
                  SAO Adviser access — Student Affairs Services
                  administration
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-[#FFD41C] group-hover:translate-x-1 transition-transform" />
            </button>
          </div>

          {/* Info Card */}
          <div className="bg-[#F5F5F5] rounded-xl p-4 flex items-start gap-3">
            <Info className="w-5 h-5 text-[#0E4EBD] flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-[#9E9E9E] text-[13px]">
                New student? Download the STI Sync mobile app to
                register your account.
              </p>
            </div>
            <button className="text-[#0E4EBD] text-[13px] font-medium hover:underline whitespace-nowrap">
              Learn More
            </button>
          </div>

          {/* Footer */}
          <div className="mt-8 text-center">
            <p className="text-[#9E9E9E] text-[11px]">
              © 2026 STI College Ormoc · Student Affairs
              Services
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}