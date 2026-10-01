import { useState, useEffect, useMemo } from 'react';
import { X, Search, Crown, Loader2, AlertCircle } from 'lucide-react';
import { useRoles } from '../../modules/roles/hooks/useRoles';
import { useOrgMembers } from '../../modules/organizations/hooks/useOrgMembers';
import { useOrgOfficers, type OrganizationOfficerDocument } from '../../modules/organizations/hooks/useOrgOfficers';
import { appointAsOfficer } from '../../modules/organizations/services/member.service';
import { sendOfficerAppointmentEmail } from '../../../services/email.service';
import type { OrganizationMemberDocument } from '../../modules/organizations/types/member.types';

interface AppointOfficerModalProps {
  isOpen: boolean;
  onClose: () => void;
  organizationId: string;
  preselectedMember?: OrganizationMemberDocument | null;
  currentOfficers: OrganizationOfficerDocument[];
}

interface AppointCandidate {
  memberDocId?: string;
  studentId: string;
  studentName: string;
  email: string;
  course?: string;
  year?: string;
  department?: string;
  contactNumber?: string;
  isExistingMember: boolean;
}

export function AppointOfficerModal({
  isOpen,
  onClose,
  organizationId,
  preselectedMember,
  currentOfficers,
}: AppointOfficerModalProps) {
  const { data: roles, loading: loadingRoles } = useRoles();
  const { members, loading: loadingMembers } = useOrgMembers(organizationId);
  const { officers: allActiveOfficers = [], loading: loadingAllOfficers } = useOrgOfficers('all');

  const [selectedCandidate, setSelectedCandidate] = useState<AppointCandidate | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  const [roleId, setRoleId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize or reset candidate when modal opens
  useEffect(() => {
    if (isOpen) {
      if (preselectedMember) {
        setSelectedCandidate({
          memberDocId: preselectedMember.id,
          studentId: preselectedMember.studentId,
          studentName: preselectedMember.studentName,
          email: preselectedMember.email,
          course: preselectedMember.course,
          year: preselectedMember.year,
          department: preselectedMember.department,
          contactNumber: preselectedMember.contactNumber,
          isExistingMember: true,
        });
      } else {
        setSelectedCandidate(null);
      }
      setSearchQuery('');
      setRoleId('');
      setError(null);
    }
  }, [isOpen, preselectedMember]);

  // Set of student IDs and emails that are already active officers in ANY organization
  const allActiveOfficerKeys = useMemo(() => {
    const keys = new Set<string>();
    allActiveOfficers.forEach((o) => {
      if (o.isActive) {
        if (o.studentId) keys.add(o.studentId.trim().toLowerCase());
        if (o.email) keys.add(o.email.trim().toLowerCase());
      }
    });
    currentOfficers.forEach((o) => {
      if (o.isActive) {
        if (o.studentId) keys.add(o.studentId.trim().toLowerCase());
        if (o.email) keys.add(o.email.trim().toLowerCase());
      }
    });
    return keys;
  }, [allActiveOfficers, currentOfficers]);

  const activeRoles = useMemo(() => roles.filter((r) => !r.archived), [roles]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCandidate) {
      setError('Please select a student candidate first.');
      return;
    }
    if (!roleId) {
      setError('Please select a role.');
      return;
    }

    // 1. Enforce that only registered members of this organization can be appointed
    const sId = (selectedCandidate.studentId || '').trim().toLowerCase();
    const sEmail = (selectedCandidate.email || '').trim().toLowerCase();
    const isMember = members.some(
      (m) =>
        (m.studentId && m.studentId.trim().toLowerCase() === sId) ||
        (m.id && m.id === selectedCandidate.memberDocId)
    );
    if (!isMember) {
      setError('Only registered members of this organization can be appointed as an officer.');
      return;
    }

    // 2. Enforce that the student is not already an officer in this or another organization
    if (allActiveOfficerKeys.has(sId) || (sEmail && allActiveOfficerKeys.has(sEmail))) {
      setError(
        `${selectedCandidate.studentName} is already an active officer. An officer credential can only be used once per organization.`
      );
      return;
    }

    const selectedRole = activeRoles.find((r) => r.id === roleId);
    const roleName = selectedRole?.name || '';

    // 3. Enforce that only one active officer can hold each role in this organization
    const activeOfficerForRole = currentOfficers.find(
      (o) =>
        o.isActive &&
        (o.roleId === roleId || (roleName && o.roleName?.trim().toLowerCase() === roleName.trim().toLowerCase()))
    );
    if (activeOfficerForRole) {
      setError(
        `The role "${roleName}" is already occupied by ${activeOfficerForRole.studentName}. Please choose another position or revoke the existing appointment first.`
      );
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await appointAsOfficer(
        organizationId,
        selectedCandidate.memberDocId || '',
        roleId,
        selectedCandidate.studentId,
        selectedCandidate.studentName,
        selectedCandidate.email,
        '', // Credentials are the same as student/mobile app
        roleName,
        {
          course: selectedCandidate.course,
          year: selectedCandidate.year,
          department: selectedCandidate.department,
          contactNumber: selectedCandidate.contactNumber,
        }
      );

      // Send appointment notification email asynchronously
      if (selectedCandidate.email) {
        sendOfficerAppointmentEmail({
          to: selectedCandidate.email,
          officerName: selectedCandidate.studentName,
          orgName: 'Student Organization',
          roleName: roleName || 'Executive Officer',
          studentId: selectedCandidate.studentId,
        }).catch((err) => {
          console.warn('[AppointOfficerModal] Email notice failed:', err);
        });
      }

      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to appoint officer.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-[520px] shadow-2xl flex flex-col max-h-[90vh]">
        <div className="bg-[#001A4D] px-6 py-4 rounded-t-2xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-[#FFC107]" />
            <h2 className="text-white font-semibold text-lg">Appoint Officer</h2>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-white hover:bg-white/10 rounded-lg p-1.5 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {!selectedCandidate ? (
            <div className="mb-6 relative">
              <label className="block text-sm font-semibold text-[#001A4D] mb-1.5">
                Select Candidate <span className="text-gray-400 font-normal">(Registered Club Members Only)</span>
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search registered club members by name or ID..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setShowDropdown(true);
                  }}
                  onFocus={() => setShowDropdown(true)}
                  className="w-full pl-9 pr-4 py-2 border border-[#E0E0E0] rounded-xl text-sm focus:ring-2 focus:ring-[#0E4EBD] focus:border-transparent outline-none"
                />
              </div>

              {showDropdown && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#E0E0E0] rounded-xl shadow-xl z-50 max-h-56 overflow-y-auto">
                  {loadingMembers || loadingAllOfficers ? (
                    <div className="p-3 text-sm text-gray-500 text-center flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-[#0E4EBD]" /> Loading club members...
                    </div>
                  ) : (
                    (() => {
                      const q = searchQuery.toLowerCase().trim();

                      // Only registered members of THIS organization who are NOT active officers in ANY organization
                      const eligibleClubMembers: AppointCandidate[] = members
                        .filter((m) => {
                          if (m.status && m.status !== 'active') return false;

                          const sId = (m.studentId || '').trim().toLowerCase();
                          const sEmail = (m.email || '').trim().toLowerCase();

                          // Exclude if already an active officer in ANY organization
                          if (allActiveOfficerKeys.has(sId) || (sEmail && allActiveOfficerKeys.has(sEmail))) {
                            return false;
                          }

                          const fullName = (m.studentName || '').toLowerCase();
                          return !q || fullName.includes(q) || sId.includes(q) || sEmail.includes(q);
                        })
                        .map((m) => ({
                          memberDocId: m.id,
                          studentId: m.studentId,
                          studentName: m.studentName,
                          email: m.email,
                          course: m.course,
                          year: m.year,
                          department: m.department,
                          contactNumber: m.contactNumber,
                          isExistingMember: true,
                        }))
                        .slice(0, 30);

                      if (eligibleClubMembers.length === 0) {
                        return (
                          <div className="p-4 text-sm text-gray-500 text-center">
                            {searchQuery
                              ? `No eligible club members found matching "${searchQuery}". (Students who already hold an officer role in any organization are excluded)`
                              : 'No eligible club members available. All members are either already officers or no members have registered yet.'}
                          </div>
                        );
                      }

                      return eligibleClubMembers.map((candidate) => (
                        <div
                          key={candidate.studentId}
                          onClick={() => {
                            setSelectedCandidate(candidate);
                            setShowDropdown(false);
                            setSearchQuery('');
                          }}
                          className="px-4 py-2.5 border-b border-gray-100 last:border-0 flex items-center justify-between hover:bg-blue-50/60 cursor-pointer transition-colors"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-[#001A4D] text-sm">
                                {candidate.studentName}
                              </span>
                              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full text-[10px] font-bold">
                                Member
                              </span>
                            </div>
                            <div className="text-xs text-gray-500 font-mono mt-0.5">
                              {candidate.studentId} · {candidate.course || 'Member'} {candidate.year ? `(${candidate.year})` : ''}
                            </div>
                          </div>
                          <span className="text-xs text-blue-600 font-medium hover:underline">
                            Select
                          </span>
                        </div>
                      ));
                    })()
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="mb-6 p-4 border border-[#E0E0E0] rounded-xl flex items-center justify-between bg-blue-50/40">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#001A4D] rounded-full flex items-center justify-center text-[#FFD41C] font-bold text-sm shadow-xs">
                  {selectedCandidate.studentName.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[#001A4D] text-sm">
                      {selectedCandidate.studentName}
                    </span>
                    {selectedCandidate.isExistingMember ? (
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full text-[10px] font-bold">
                        Club Member
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full text-[10px] font-bold">
                        Enrolled Student
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 font-mono">
                    ID: {selectedCandidate.studentId} {selectedCandidate.course ? `· ${selectedCandidate.course} (${selectedCandidate.year})` : ''}
                  </div>
                </div>
              </div>
              {!preselectedMember && (
                <button
                  type="button"
                  onClick={() => setSelectedCandidate(null)}
                  className="text-xs text-[#0E4EBD] hover:underline font-bold cursor-pointer"
                >
                  Change
                </button>
              )}
            </div>
          )}

          <form id="appoint-officer-form" onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-[#001A4D] mb-1.5">
                Executive Position / Role <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={roleId}
                onChange={(e) => {
                  setRoleId(e.target.value);
                  setError(null);
                }}
                className="w-full px-3.5 py-2.5 border border-[#E0E0E0] rounded-xl text-sm focus:ring-2 focus:ring-[#0E4EBD] bg-white outline-none cursor-pointer"
                disabled={loadingRoles}
              >
                <option value="">Select a role...</option>
                {activeRoles.map((role) => {
                  const assignedOfficer = currentOfficers.find(
                    (o) =>
                      o.isActive &&
                      (o.roleId === role.id || o.roleName?.trim().toLowerCase() === role.name?.trim().toLowerCase())
                  );
                  const isFilled = Boolean(assignedOfficer);
                  return (
                    <option key={role.id} value={role.id} disabled={isFilled}>
                      {role.name} {isFilled ? `(Occupied - ${assignedOfficer?.studentName})` : ''}
                    </option>
                  );
                })}
              </select>
              <p className="text-[11px] text-gray-500 mt-1">
                Roles already assigned to active officers cannot be selected.
              </p>
            </div>

            {selectedCandidate && (
              <div className="p-3.5 bg-blue-50/60 border border-blue-200/80 rounded-xl text-xs text-blue-900 leading-relaxed">
                Appointing <strong>{selectedCandidate.studentName}</strong> to this executive position. Officer portal access uses their existing mobile app / student credentials.
              </div>
            )}
          </form>
        </div>

        <div className="border-t border-[#E0E0E0] px-6 py-4 bg-gray-50 rounded-b-2xl flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="appoint-officer-form"
            disabled={isSubmitting || !selectedCandidate || !roleId}
            className="px-5 py-2 text-sm font-bold text-[#001A4D] bg-[#FFC107] hover:bg-[#FFC107]/90 rounded-xl transition-colors flex items-center gap-2 shadow-xs disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {isSubmitting ? 'Appointing...' : 'Appoint Officer'}
          </button>
        </div>
      </div>
    </div>
  );
}
