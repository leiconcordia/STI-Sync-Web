/**
 * src/app/modules/organizations/components/ManageAdviserSubstituteModal.tsx
 *
 * Shared modal for Primary Club Advisers (in /officer/settings) and SAS Admin
 * (in EditOrganizationModal) to:
 *  1. Assign, replace, or remove the organization's Substitute / Secondary Co-Adviser
 *     using the Employee Masterlist (auto-fetching existing STI Sync email, showing a
 *     Default / Temporary Password ONLY when the person has no existing account, and
 *     detecting reusable e-signatures).
 *  2. Toggle the Primary Club Adviser's Portal Status between Active and Inactive (On Leave),
 *     enforcing the strict guardrail: cannot go Inactive if pending Officer submissions exist
 *     (AP, SBR, FL, PAR) and no Substitute / Co-Adviser is assigned.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  UserCog,
  Search,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  PenTool,
  Trash2,
  Power,
  CalendarClock,
  Copy,
  KeyRound,
  Loader2,
  FileText,
  Mail,
  UserCheck,
  Ban,
  RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';
import { useEmployees } from '../../employees';
import {
  assignOrganizationSubAdviser,
  getOrgPendingAdviserReviewDocuments,
  removeOrganizationSubAdviser,
  setOrganizationAdviserPortalStatus,
} from '../services/organization.service';
import {
  isPrimaryAdviserUnavailable,
  validateAdviserPortalInactivation,
  type AdviserPendingDocSummary,
} from '../utils/adviser-authority.utils';
import {
  checkEmailHasExistingPortalAccount,
  generateTemporaryPassword,
  getInstitutionalSignatories,
  resolveExistingEmployeeEmail,
} from '../../signatories/services/signatory.service';
import { resolveUserSignature } from '../../signatories/services/signatory-resolver.service';
import type { InstitutionalSignatory } from '../../signatories/types/signatory.types';
import type { OrgAdviserAvailability, OrgAdviserData } from '../types/organization.types';

export interface ManageAdviserSubstituteModalProps {
  isOpen: boolean;
  onClose: () => void;
  organization: {
    id: string;
    name: string;
    adviser?: OrgAdviserData | null;
    coAdviser?: OrgAdviserData | null;
    adviserAvailability?: OrgAdviserAvailability | null;
  };
  actorName: string;
  initialTab?: 'substitute' | 'leave';
}

const DOC_TYPE_LABELS: Record<string, string> = {
  proposal: 'Activity Proposal',
  sbr: 'Supplemental Budget',
  liquidation: 'Financial Liquidation',
  par: 'Post-Activity Report',
};

export function ManageAdviserSubstituteModal({
  isOpen,
  onClose,
  organization,
  actorName,
  initialTab = 'leave',
}: ManageAdviserSubstituteModalProps) {
  const { data: employees = [], loading: employeesLoading } = useEmployees();
  const [activeTab, setActiveTab] = useState<'substitute' | 'leave'>(initialTab);
  const [allSignatories, setAllSignatories] = useState<InstitutionalSignatory[]>([]);

  const [currentSub, setCurrentSub] = useState<OrgAdviserData | null>(organization.coAdviser || null);
  const [isInactive, setIsInactive] = useState<boolean>(
    isPrimaryAdviserUnavailable(organization.adviserAvailability)
  );
  const [inactiveReason, setInactiveReason] = useState<string>(
    organization.adviserAvailability?.unavailableReason || ''
  );

  // Pending documents awaiting Adviser review
  const [pendingDocs, setPendingDocs] = useState<AdviserPendingDocSummary[]>([]);
  const [loadingPending, setLoadingPending] = useState<boolean>(true);

  // Employee picker & form state
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [selectedEmployeeDocId, setSelectedEmployeeDocId] = useState('');
  const [subName, setSubName] = useState('');
  const [subFirstName, setSubFirstName] = useState('');
  const [subLastName, setSubLastName] = useState('');
  const [subMiddleName, setSubMiddleName] = useState('');
  const [subEmployeeId, setSubEmployeeId] = useState('');
  const [subEmail, setSubEmail] = useState('');
  const [resolvingEmail, setResolvingEmail] = useState(false);
  const [autoFetchedEmailSource, setAutoFetchedEmailSource] = useState<string | null>(null);
  const [hasExistingAccount, setHasExistingAccount] = useState<boolean>(false);
  const [defaultPassword, setDefaultPassword] = useState<string>(() => generateTemporaryPassword());

  // Signature probe
  const [probingSig, setProbingSig] = useState(false);
  const [detectedExistingSigUrl, setDetectedExistingSigUrl] = useState('');

  // Mutation busy states
  const [isAssigning, setIsAssigning] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [isTogglingLeave, setIsTogglingLeave] = useState(false);
  const [leaveReasonInput, setLeaveReasonInput] = useState(
    organization.adviserAvailability?.unavailableReason || 'On Leave'
  );
  const [provisionedCreds, setProvisionedCreds] = useState<{
    name: string;
    email: string;
    temporaryPassword: string;
  } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setActiveTab(initialTab);
    setCurrentSub(organization.coAdviser || null);
    setIsInactive(isPrimaryAdviserUnavailable(organization.adviserAvailability));
    setInactiveReason(organization.adviserAvailability?.unavailableReason || '');
    setLeaveReasonInput(organization.adviserAvailability?.unavailableReason || 'On Leave');
    setProvisionedCreds(null);
    setAutoFetchedEmailSource(null);
    setHasExistingAccount(false);
    setDefaultPassword(generateTemporaryPassword());
  }, [isOpen, organization, initialTab]);

  useEffect(() => {
    if (!isOpen || !organization.id) return;
    let cancelled = false;
    setLoadingPending(true);
    Promise.all([
      getOrgPendingAdviserReviewDocuments(organization.id),
      getInstitutionalSignatories(),
    ])
      .then(([docs, sigs]) => {
        if (cancelled) return;
        setPendingDocs(docs);
        setAllSignatories(sigs);
      })
      .catch((err) => {
        console.warn('[ManageAdviserSubstituteModal] Load notice:', err);
      })
      .finally(() => {
        if (!cancelled) setLoadingPending(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, organization.id]);

  // Debounced signature & account existence check when email changes
  useEffect(() => {
    if (!isOpen) return;
    const cleanEmail = subEmail.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setDetectedExistingSigUrl('');
      if (!autoFetchedEmailSource) setHasExistingAccount(false);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setProbingSig(true);
      try {
        const [sig, acct] = await Promise.all([
          resolveUserSignature({ email: cleanEmail, name: subName }),
          checkEmailHasExistingPortalAccount(cleanEmail),
        ]);
        if (!cancelled) {
          setDetectedExistingSigUrl(sig || '');
          setHasExistingAccount(acct.exists);
          if (acct.exists && !autoFetchedEmailSource && acct.source) {
            setAutoFetchedEmailSource(acct.source);
          }
        }
      } catch {
        if (!cancelled) setDetectedExistingSigUrl('');
      } finally {
        if (!cancelled) setProbingSig(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isOpen, subEmail, subName, autoFetchedEmailSource]);

  const activeEmployees = useMemo(() => {
    const primaryEmail = String(organization.adviser?.email || '').trim().toLowerCase();
    const primaryNormName = String(organization.adviser?.name || '').trim().toLowerCase();
    const q = employeeSearch.trim().toLowerCase();
    return employees
      .filter((e) => !e.archived && e.status === 'ACTIVE')
      .filter((e) => {
        const empName = (e.fullName || `${e.firstName} ${e.lastName}`).trim().toLowerCase();
        if (primaryNormName && empName === primaryNormName) return false;
        if (organization.adviser?.employeeId && e.employeeId && e.employeeId === organization.adviser.employeeId) {
          return false;
        }
        const matchedSig = allSignatories.find(
          (s) =>
            (e.employeeId && s.employeeId && s.employeeId === e.employeeId) ||
            s.name.trim().toLowerCase() === empName
        );
        if (primaryEmail && matchedSig && matchedSig.email.trim().toLowerCase() === primaryEmail) return false;
        if (!q) return true;
        return (
          empName.includes(q) ||
          (e.employeeId || '').toLowerCase().includes(q) ||
          (e.positionTitle || '').toLowerCase().includes(q)
        );
      });
  }, [employees, allSignatories, organization.adviser, employeeSearch]);

  const handleSelectEmployee = async (empDocId: string) => {
    setSelectedEmployeeDocId(empDocId);
    setAutoFetchedEmailSource(null);
    setHasExistingAccount(false);
    const emp = employees.find((e) => e.id === empDocId);
    if (!emp) {
      setSubName('');
      setSubFirstName('');
      setSubLastName('');
      setSubMiddleName('');
      setSubEmployeeId('');
      setSubEmail('');
      return;
    }
    const full = emp.fullName || [emp.firstName, emp.middleName, emp.lastName].filter(Boolean).join(' ');
    setSubName(full);
    setSubFirstName(emp.firstName || '');
    setSubLastName(emp.lastName || '');
    setSubMiddleName(emp.middleName || '');
    setSubEmployeeId(emp.employeeId || '');

    const matchedSig = allSignatories.find(
      (s) =>
        (emp.employeeId && s.employeeId && s.employeeId === emp.employeeId) ||
        s.name.trim().toLowerCase() === full.trim().toLowerCase()
    );
    if (matchedSig?.email) {
      setSubEmail(matchedSig.email);
      setAutoFetchedEmailSource('Institutional Signatory');
      setHasExistingAccount(true);
      return;
    }

    setSubEmail('');
    setDefaultPassword(generateTemporaryPassword());
    setResolvingEmail(true);
    try {
      const resolved = await resolveExistingEmployeeEmail({
        employeeId: emp.employeeId,
        fullName: full,
        firstName: emp.firstName,
        middleName: emp.middleName,
        lastName: emp.lastName,
        email: (emp as any).email,
      });
      if (resolved?.email) {
        setSubEmail(resolved.email);
        setAutoFetchedEmailSource(resolved.source || 'STI Sync');
        setHasExistingAccount(true);
      } else {
        setHasExistingAccount(false);
      }
    } catch {
      setHasExistingAccount(false);
    } finally {
      setResolvingEmail(false);
    }
  };

  const handleAssignSub = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = subName.trim();
    const cleanEmail = subEmail.trim().toLowerCase();
    if (!cleanName) {
      toast.error('Please select an employee from the Employee Masterlist.');
      return;
    }
    if (!cleanEmail || !cleanEmail.includes('@')) {
      toast.error('Please enter a valid institutional email address.');
      return;
    }
    if (!hasExistingAccount && defaultPassword.trim().length < 6) {
      toast.error('Default password must be at least 6 characters.');
      return;
    }

    setIsAssigning(true);
    setProvisionedCreds(null);
    try {
      const res = await assignOrganizationSubAdviser(
        organization.id,
        {
          name: cleanName,
          firstName: subFirstName || undefined,
          lastName: subLastName || undefined,
          middleName: subMiddleName || undefined,
          email: cleanEmail,
          employeeId: subEmployeeId || undefined,
          temporaryPassword: hasExistingAccount ? undefined : defaultPassword.trim(),
        },
        actorName
      );
      if (!res.success || !res.coAdviser) {
        toast.error(res.error || 'Could not assign Substitute Adviser.');
        return;
      }

      setCurrentSub(res.coAdviser);
      if (res.accountProvisioning === 'created' && res.temporaryPassword) {
        setProvisionedCreds({
          name: res.coAdviser.name,
          email: res.coAdviser.email,
          temporaryPassword: res.temporaryPassword,
        });
        toast.success(`Substitute Adviser assigned! New credentials provisioned for ${res.coAdviser.name}.`);
      } else {
        toast.success(`${res.coAdviser.name} assigned as Substitute / Co-Adviser (existing STI Sync account reused).`);
      }

      setSelectedEmployeeDocId('');
      setSubName('');
      setSubFirstName('');
      setSubLastName('');
      setSubMiddleName('');
      setSubEmployeeId('');
      setSubEmail('');
      setAutoFetchedEmailSource(null);
      setHasExistingAccount(false);
      setDefaultPassword(generateTemporaryPassword());
      setDetectedExistingSigUrl('');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to assign Substitute Adviser.');
    } finally {
      setIsAssigning(false);
    }
  };

  const handleRemoveSub = async () => {
    if (!currentSub) return;
    setIsRemoving(true);
    try {
      const res = await removeOrganizationSubAdviser(organization.id, actorName);
      if (!res.success) {
        if (res.pendingDocuments) setPendingDocs(res.pendingDocuments);
        toast.error(res.error || 'Could not remove Substitute Adviser.');
        return;
      }
      setCurrentSub(null);
      toast.success('Substitute / Co-Adviser removed.');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to remove Substitute Adviser.');
    } finally {
      setIsRemoving(false);
    }
  };

  const inactivationCheck = useMemo(
    () =>
      validateAdviserPortalInactivation({
        hasCoAdviser: Boolean(currentSub && (currentSub.email || currentSub.authUid || currentSub.name)),
        pendingDocuments: pendingDocs,
      }),
    [currentSub, pendingDocs]
  );

  const handleTogglePortalStatus = async (targetInactive: boolean) => {
    setIsTogglingLeave(true);
    try {
      const res = await setOrganizationAdviserPortalStatus(
        organization.id,
        {
          inactive: targetInactive,
          reason: targetInactive ? leaveReasonInput : undefined,
        },
        actorName
      );
      if (!res.success) {
        if (res.pendingDocuments) setPendingDocs(res.pendingDocuments);
        toast.error(res.error || 'Could not update Adviser Portal status.');
        return;
      }
      setIsInactive(targetInactive);
      setInactiveReason(targetInactive ? (leaveReasonInput.trim() || 'On Leave') : '');
      if (targetInactive) {
        toast.success(
          currentSub
            ? `Adviser Portal set to Inactive. Approval authority has been transferred to ${currentSub.name}.`
            : 'Adviser Portal set to Inactive.'
        );
      } else {
        toast.success('Adviser Portal reactivated! Primary approval authority restored.');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update Adviser Portal status.');
    } finally {
      setIsTogglingLeave(false);
    }
  };

  const copyText = (value: string, label: string) => {
    navigator.clipboard.writeText(value);
    toast.success(`${label} copied to clipboard.`);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200 my-auto">
        {/* Header */}
        <div className="bg-[#001A4D] px-6 py-4 flex items-center justify-between text-white">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#FFD41C]/20 border border-[#FFD41C]/40 text-[#FFD41C] flex items-center justify-center shrink-0">
              <UserCog className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-extrabold text-base tracking-wide truncate">
                Club Adviser Availability &amp; Substitute Transfer
              </h3>
              <p className="text-xs text-blue-200 truncate">
                Organization: <strong className="text-white">{organization.name}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-300 hover:text-white rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sub-Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-6">
          <button
            type="button"
            onClick={() => setActiveTab('leave')}
            className={`px-4 py-3 text-xs font-extrabold border-b-2 transition-colors flex items-center gap-2 cursor-pointer ${
              activeTab === 'leave'
                ? 'border-[#001A4D] text-[#001A4D]'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <CalendarClock className="w-4 h-4" />
            <span>Portal Status (Active / Inactive)</span>
            {isInactive && (
              <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-black">
                Inactive
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('substitute')}
            className={`px-4 py-3 text-xs font-extrabold border-b-2 transition-colors flex items-center gap-2 cursor-pointer ${
              activeTab === 'substitute'
                ? 'border-[#001A4D] text-[#001A4D]'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            <span>Substitute / Co-Adviser</span>
            {currentSub && (
              <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black">
                Assigned
              </span>
            )}
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {activeTab === 'leave' ? (
            <div className="space-y-5">
              {/* Current Portal Status */}
              <div
                className={`p-4 rounded-2xl border flex items-center justify-between gap-4 ${
                  isInactive ? 'bg-amber-50 border-amber-300' : 'bg-emerald-50/70 border-emerald-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      isInactive ? 'bg-amber-200/70 text-amber-900' : 'bg-emerald-200/70 text-emerald-800'
                    }`}
                  >
                    <Power className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-slate-900">
                      {isInactive ? 'Adviser Portal Inactive (Authority Transferred)' : 'Adviser Portal Active'}
                    </p>
                    <p className="text-xs text-slate-600 mt-0.5">
                      {isInactive
                        ? currentSub
                          ? `Approval authority is currently transferred to ${currentSub.name} (${currentSub.email}).`
                          : 'Portal is inactive with zero pending Officer submissions.'
                        : currentSub
                        ? `You hold sole approval authority. ${currentSub.name} is in Standby Mode and cannot approve while you are active.`
                        : 'You hold approval authority for all Officer submissions.'}
                    </p>
                  </div>
                </div>
                <span
                  className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider shrink-0 ${
                    isInactive ? 'bg-amber-200 text-amber-900' : 'bg-emerald-200 text-emerald-900'
                  }`}
                >
                  {isInactive ? 'Inactive' : 'Active'}
                </span>
              </div>

              {/* Pending Officer Submissions Box */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-slate-800 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[#0E4EBD]" />
                    Pending Officer Documents Awaiting Adviser Review
                  </span>
                  {loadingPending ? (
                    <span className="text-xs text-slate-500 flex items-center gap-1">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking...
                    </span>
                  ) : (
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] font-black ${
                        pendingDocs.length > 0
                          ? 'bg-amber-100 text-amber-900'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {pendingDocs.length} Pending
                    </span>
                  )}
                </div>

                {!loadingPending && pendingDocs.length > 0 && (
                  <ul className="divide-y divide-slate-200 bg-white rounded-xl border border-slate-200 max-h-40 overflow-y-auto">
                    {pendingDocs.map((d) => (
                      <li key={`${d.documentType}-${d.id}`} className="px-3 py-2 text-xs flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-bold text-slate-800 truncate">{d.title}</p>
                          <p className="text-[11px] text-slate-500 truncate">
                            {DOC_TYPE_LABELS[d.documentType] || d.documentType} • Submitted by {d.submittedByName || 'Officer'}
                          </p>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800 shrink-0">
                          For Adviser Review
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {isInactive ? (
                <div className="space-y-4">
                  <div className="text-xs bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">Recorded Reason</span>
                    <span className="font-bold text-slate-800">{inactiveReason || 'On Leave'}</span>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2 border border-slate-300 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-50 cursor-pointer"
                    >
                      Close
                    </button>
                    <button
                      type="button"
                      disabled={isTogglingLeave}
                      onClick={() => handleTogglePortalStatus(false)}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold shadow-sm disabled:opacity-50 cursor-pointer"
                    >
                      {isTogglingLeave ? <Loader2 className="w-4 h-4 animate-spin" /> : <Power className="w-4 h-4" />}
                      Reactivate Adviser Portal
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {!loadingPending && !inactivationCheck.allowed && (
                    <div className="p-4 rounded-xl bg-rose-50 border-2 border-rose-300 flex items-start gap-3">
                      <Ban className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                      <div className="text-xs text-rose-950 space-y-2">
                        <p className="font-black">Cannot Set Adviser Portal Inactive</p>
                        <p className="text-rose-800 leading-relaxed">{inactivationCheck.reason}</p>
                        <button
                          type="button"
                          onClick={() => setActiveTab('substitute')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-800 text-white text-[11px] font-bold cursor-pointer"
                        >
                          <UserCog className="w-3.5 h-3.5" />
                          Assign Substitute Adviser First
                        </button>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Leave / Inactivation Reason
                    </label>
                    <input
                      type="text"
                      value={leaveReasonInput}
                      onChange={(e) => setLeaveReasonInput(e.target.value)}
                      placeholder="e.g. Official Business, Vacation Leave, Sick Leave"
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#0E4EBD]/30 focus:border-[#0E4EBD] outline-none"
                    />
                  </div>

                  {currentSub && (
                    <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-900 flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-[#0E4EBD] shrink-0" />
                      <span>
                        Once set to Inactive, approval authority will immediately transfer to <strong>{currentSub.name}</strong> ({currentSub.email}).
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2 border border-slate-300 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-50 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={isTogglingLeave || loadingPending || !inactivationCheck.allowed}
                      onClick={() => handleTogglePortalStatus(true)}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-extrabold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {isTogglingLeave ? <Loader2 className="w-4 h-4 animate-spin" /> : <Power className="w-4 h-4" />}
                      Set Portal Inactive (Transfer to Sub)
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              {provisionedCreds && (
                <div className="p-4 rounded-xl bg-emerald-50 border-2 border-emerald-300 space-y-3">
                  <div className="flex items-start gap-2.5">
                    <KeyRound className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
                    <div className="text-xs text-emerald-950">
                      <p className="font-extrabold">New Substitute Adviser Account Provisioned!</p>
                      <p className="text-emerald-800 mt-0.5">
                        A welcome email has been dispatched. Copy the credentials below to share securely with <strong>{provisionedCreds.name}</strong>.
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div className="bg-white rounded-lg border border-emerald-200 px-3 py-2 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Email</span>
                        <span className="font-mono font-bold text-slate-800 truncate block">{provisionedCreds.email}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyText(provisionedCreds.email, 'Email')}
                        className="p-1.5 hover:bg-slate-100 rounded text-slate-600 cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="bg-white rounded-lg border border-emerald-200 px-3 py-2 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Default Password</span>
                        <span className="font-mono font-bold text-emerald-800 truncate block">{provisionedCreds.temporaryPassword}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyText(provisionedCreds.temporaryPassword, 'Default password')}
                        className="p-1.5 hover:bg-slate-100 rounded text-slate-600 cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {currentSub ? (
                <div className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-200 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-11 h-11 rounded-xl bg-[#001A4D] text-[#FFD41C] font-black text-base flex items-center justify-center shrink-0">
                        {currentSub.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-sm font-black text-[#001A4D] truncate">{currentSub.name}</h4>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                            {isInactive ? 'Acting Approval Authority Active' : 'Standby (Primary Active)'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 flex items-center gap-1.5 mt-0.5 truncate">
                          <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{currentSub.email}</span>
                          {currentSub.employeeId && <span className="text-slate-400">• ID: {currentSub.employeeId}</span>}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={isRemoving}
                      onClick={handleRemoveSub}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer shrink-0"
                    >
                      {isRemoving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 flex items-start gap-3 text-xs text-amber-900">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">No Substitute / Co-Adviser Assigned</p>
                    <p className="text-amber-800 mt-0.5">
                      Assign an authorized STI employee below so approval authority transfers seamlessly whenever you set your Adviser Portal to Inactive.
                    </p>
                  </div>
                </div>
              )}

              <form onSubmit={handleAssignSub} className="space-y-4 pt-2 border-t border-slate-100">
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-[#001A4D]">
                    {currentSub ? 'Replace Substitute / Co-Adviser' : 'Assign Substitute / Co-Adviser'}
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Select an employee from the Employee Masterlist. Existing emails &amp; e-signatures are auto-fetched and reused automatically.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-700">
                    Search Employee Masterlist
                  </label>
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={employeeSearch}
                      onChange={(e) => setEmployeeSearch(e.target.value)}
                      placeholder="Filter employees by name, ID, or position..."
                      className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#0E4EBD]/30 focus:border-[#0E4EBD] outline-none"
                    />
                  </div>
                  <select
                    value={selectedEmployeeDocId}
                    onChange={(e) => handleSelectEmployee(e.target.value)}
                    disabled={employeesLoading}
                    className="w-full px-3 py-2.5 text-xs font-semibold text-slate-800 border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-[#0E4EBD]/30 focus:border-[#0E4EBD] outline-none"
                  >
                    <option value="">
                      {employeesLoading
                        ? 'Loading Employee Masterlist...'
                        : `-- Select Employee (${activeEmployees.length} available) --`}
                    </option>
                    {activeEmployees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.fullName} {emp.employeeId ? `(${emp.employeeId})` : ''}{' '}
                        {emp.positionTitle ? `— ${emp.positionTitle}` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Substitute Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={subName}
                      onChange={(e) => setSubName(e.target.value)}
                      placeholder="Auto-filled from Employee Masterlist"
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#0E4EBD]/30 focus:border-[#0E4EBD] outline-none"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-bold text-slate-700">
                        Institutional Email *
                      </label>
                      {resolvingEmail ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600">
                          <Loader2 className="w-3 h-3 animate-spin" /> Fetching...
                        </span>
                      ) : autoFetchedEmailSource ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700">
                          <CheckCircle2 className="w-3 h-3" /> Auto-fetched ({autoFetchedEmailSource})
                        </span>
                      ) : null}
                    </div>
                    <input
                      type="email"
                      required
                      value={subEmail}
                      onChange={(e) => {
                        setSubEmail(e.target.value);
                        setAutoFetchedEmailSource(null);
                        setHasExistingAccount(false);
                      }}
                      placeholder={resolvingEmail ? 'Checking existing STI Sync email...' : 'e.g. coadviser@ormoc.sti.edu.ph'}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#0E4EBD]/30 focus:border-[#0E4EBD] outline-none"
                    />
                  </div>
                </div>

                {/* Default / Temporary Password ONLY when no existing STI Sync account is found */}
                {(subName.trim() || subEmail.trim()) && !resolvingEmail && !hasExistingAccount && (
                  <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs font-bold text-[#001A4D] flex items-center gap-1.5">
                        <KeyRound className="w-3.5 h-3.5 text-[#0E4EBD]" />
                        <span>Default / Temporary Password (New Account) *</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => setDefaultPassword(generateTemporaryPassword())}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-[#0E4EBD] hover:underline cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Regenerate
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        required
                        minLength={6}
                        value={defaultPassword}
                        onChange={(e) => setDefaultPassword(e.target.value)}
                        className="flex-1 px-3 py-2 bg-white border border-blue-200 rounded-lg font-mono text-xs font-bold text-[#001A4D] focus:ring-2 focus:ring-[#0E4EBD]/30 focus:border-[#0E4EBD] outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => copyText(defaultPassword, 'Default password')}
                        className="inline-flex items-center gap-1 px-3 py-2 bg-white hover:bg-slate-50 border border-blue-200 rounded-lg text-xs font-bold text-slate-700 cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        Copy
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-600">
                      This employee does not have an STI Sync account yet. A new account will be created with this default password.
                    </p>
                  </div>
                )}

                {hasExistingAccount && !resolvingEmail && (
                  <div className="px-3.5 py-2.5 rounded-xl bg-emerald-50/80 border border-emerald-200 text-xs text-emerald-900 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      <strong>Existing STI Sync account detected{autoFetchedEmailSource ? ` (${autoFetchedEmailSource})` : ''}:</strong> Existing credentials will be reused — no default password needed.
                    </span>
                  </div>
                )}

                {subEmail.trim().includes('@') && (
                  <div className="px-3.5 py-2.5 rounded-xl border text-xs flex items-center justify-between gap-3 bg-slate-50 border-slate-200">
                    {probingSig ? (
                      <span className="flex items-center gap-2 text-slate-500">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Checking for existing e-signature...
                      </span>
                    ) : detectedExistingSigUrl ? (
                      <>
                        <span className="flex items-center gap-2 text-emerald-700 font-bold">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          Existing verified e-signature detected — will be reused automatically!
                        </span>
                        <img
                          src={detectedExistingSigUrl}
                          alt="Detected signature"
                          className="h-6 max-w-[90px] object-contain bg-white border border-emerald-200 rounded px-1.5"
                        />
                      </>
                    ) : (
                      <span className="flex items-center gap-2 text-amber-800 font-medium">
                        <PenTool className="w-4 h-4 text-amber-600 shrink-0" />
                        No e-signature on file yet — substitute will be required to register their own e-signature on login.
                      </span>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 border border-slate-300 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-50 cursor-pointer"
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    disabled={isAssigning}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#001A4D] hover:bg-[#0A2E6D] text-white text-xs font-extrabold shadow-sm disabled:opacity-50 cursor-pointer"
                  >
                    {isAssigning ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Saving Substitute...
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4 text-[#FFD41C]" />
                        {currentSub ? 'Update Substitute Adviser' : 'Save Substitute Adviser'}
                      </>
                    )}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
