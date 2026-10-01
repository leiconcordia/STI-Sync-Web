/**
 * src/app/signatory/components/SignatoryChangePasswordModal.tsx
 *
 * Dedicated modal for Institutional Signatories to update their temporary or existing password.
 * Strictly deactivates the temporary password once a new password is set.
 */

import React, { useState } from 'react';
import {
  KeyRound,
  Eye,
  EyeOff,
  ShieldCheck,
  AlertTriangle,
  Lock,
  CheckCircle2,
  X,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { changeSignatoryPassword } from '../../auth/services/password.service';

interface SignatoryChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: any;
  onPasswordChanged?: () => void;
  isMandatory?: boolean;
}

export default function SignatoryChangePasswordModal({
  isOpen,
  onClose,
  session,
  onPasswordChanged,
  isMandatory = false,
}: SignatoryChangePasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  // Password strength checks
  const hasMinLength = newPassword.length >= 8;
  const hasUppercase = /[A-Z]/.test(newPassword);
  const hasNumberOrSymbol = /[0-9!@#$%^&*(),.?":{}|<>]/.test(newPassword);
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;

  const strengthScore = [hasMinLength, hasUppercase, hasNumberOrSymbol].filter(Boolean).length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const trimmedCurrent = currentPassword.trim();
    const trimmedNew = newPassword.trim();
    const trimmedConfirm = confirmPassword.trim();

    if (!trimmedCurrent) {
      setErrorMsg('Please enter your current or temporary password.');
      return;
    }

    if (trimmedNew.length < 8) {
      setErrorMsg('New password must be at least 8 characters long.');
      return;
    }

    if (trimmedCurrent === trimmedNew) {
      setErrorMsg('New password must be different from your current temporary password.');
      return;
    }

    if (trimmedNew !== trimmedConfirm) {
      setErrorMsg('New passwords do not match. Please verify your confirmation.');
      return;
    }

    setIsSubmitting(true);
    try {
      await changeSignatoryPassword(trimmedCurrent, trimmedNew, session);
      toast.success('Password updated successfully! Your account is now secured.');
      
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      
      if (onPasswordChanged) {
        onPasswordChanged();
      }
      onClose();
    } catch (err: any) {
      console.error('[SignatoryChangePasswordModal] Error updating password:', err);
      const msg = err.message || 'Failed to update password. Please try again.';
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-gray-100 animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="bg-[#001A4D] px-6 py-5 text-white relative">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#FFD41C]/20 border border-[#FFD41C]/40 text-[#FFD41C] flex items-center justify-center flex-shrink-0">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-base tracking-wide text-white">
                  {isMandatory ? 'Setup Permanent Password' : 'Change Password'}
                </h3>
                {isMandatory && (
                  <span className="px-2 py-0.5 bg-amber-400/20 text-amber-300 border border-amber-400/30 text-[10px] font-black uppercase rounded tracking-wider">
                    Required
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-300 mt-0.5">
                {session?.email || 'Institutional Signatory'}
              </p>
            </div>
          </div>

          {!isMandatory && (
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="absolute top-5 right-5 text-gray-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Informational Banner */}
        {isMandatory ? (
          <div className="bg-amber-50 border-b border-amber-200 px-6 py-3 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-900 leading-relaxed font-medium">
              You logged in using an administrative temporary password. For security, please establish your permanent password. The temporary password will be permanently disabled upon saving.
            </p>
          </div>
        ) : (
          <div className="bg-blue-50 border-b border-blue-100 px-6 py-2.5 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#0E4EBD] flex-shrink-0" />
            <p className="text-xs text-blue-900 font-medium">
              Choose a strong, unique password to protect your digital signature.
            </p>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Current Password Field */}
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
              {isMandatory ? 'Current Temporary Password' : 'Current Password'}
            </label>
            <div className="relative">
              <input
                type={showCurrent ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder={isMandatory ? 'Enter temporary password (e.g. STI-Sign-...)' : 'Enter current password'}
                required
                className="w-full pl-3.5 pr-10 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-xs text-gray-900 placeholder:text-gray-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#001A4D]/20 focus:border-[#001A4D] transition-all font-mono"
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

          {/* New Password Field */}
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
              New Password
            </label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Create strong permanent password"
                required
                className="w-full pl-3.5 pr-10 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-xs text-gray-900 placeholder:text-gray-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#001A4D]/20 focus:border-[#001A4D] transition-all font-mono"
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {/* Password Strength Indicator */}
            {newPassword.length > 0 && (
              <div className="mt-2 space-y-1.5">
                <div className="flex gap-1 h-1.5">
                  <div
                    className={`flex-1 rounded-full transition-all ${
                      strengthScore >= 1 ? 'bg-amber-400' : 'bg-gray-200'
                    }`}
                  />
                  <div
                    className={`flex-1 rounded-full transition-all ${
                      strengthScore >= 2 ? 'bg-blue-500' : 'bg-gray-200'
                    }`}
                  />
                  <div
                    className={`flex-1 rounded-full transition-all ${
                      strengthScore >= 3 ? 'bg-emerald-500' : 'bg-gray-200'
                    }`}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-gray-500">
                  <span className="flex items-center gap-1">
                    <CheckCircle2
                      className={`w-3 h-3 ${hasMinLength ? 'text-emerald-600' : 'text-gray-300'}`}
                    />
                    8+ chars
                  </span>
                  <span className="flex items-center gap-1">
                    <CheckCircle2
                      className={`w-3 h-3 ${hasUppercase ? 'text-emerald-600' : 'text-gray-300'}`}
                    />
                    Uppercase
                  </span>
                  <span className="flex items-center gap-1">
                    <CheckCircle2
                      className={`w-3 h-3 ${hasNumberOrSymbol ? 'text-emerald-600' : 'text-gray-300'}`}
                    />
                    Number / Symbol
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Confirm Password Field */}
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
              Confirm New Password
            </label>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                required
                className={`w-full pl-3.5 pr-10 py-2.5 bg-gray-50 border rounded-xl text-xs text-gray-900 placeholder:text-gray-400 focus:bg-white focus:outline-none focus:ring-2 transition-all font-mono ${
                  confirmPassword && !passwordsMatch
                    ? 'border-red-300 focus:ring-red-200 focus:border-red-500'
                    : 'border-gray-300 focus:ring-[#001A4D]/20 focus:border-[#001A4D]'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {confirmPassword.length > 0 && (
              <p
                className={`text-[11px] mt-1 font-medium ${
                  passwordsMatch ? 'text-emerald-600' : 'text-red-600'
                }`}
              >
                {passwordsMatch ? '✓ Passwords match' : '✗ Passwords do not match'}
              </p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-end gap-2.5">
            {!isMandatory && (
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-bold text-gray-600 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={isSubmitting || !hasMinLength || (confirmPassword.length > 0 && !passwordsMatch)}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[#001A4D] hover:bg-[#0A2E6D] text-white text-xs font-bold rounded-xl shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Updating Password...
                </>
              ) : (
                <>
                  <Lock className="w-3.5 h-3.5 text-[#FFD41C]" />
                  Save Permanent Password
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
