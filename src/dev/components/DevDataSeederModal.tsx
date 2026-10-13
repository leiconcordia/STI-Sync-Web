import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Zap,
  FileText,
  FileCheck2,
  Wallet,
  Clock,
  QrCode,
  Users,
  Trash2,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  KeyRound,
  ExternalLink,
  ShieldCheck,
  Check,
  ChevronRight,
  ArrowRight,
  Layers,
  Sparkles,
  Archive,
} from 'lucide-react';
import { Button } from '../../app/components/ui/button';
import { useStudents } from '../../app/modules/students/hooks/useStudentStream';
import { useAllEvents } from '../../app/modules/events/hooks/useEventStream';
import { useAllLiquidations } from '../../app/modules/finance/hooks/useLiquidationStream';
import { useAdminPARs } from '../../app/modules/post-activity-reports/hooks/usePostActivityReportStream';
import { subscribeToSignatories } from '../../app/modules/signatories/services/signatory.service';
import { InstitutionalSignatory } from '../../app/modules/signatories/types/signatory.types';
import {
  switchActiveSignatorySession,
  signProposalStep,
  signAllProposalSteps,
  concludeLifecycleEvent,
  seedLifecycleLiquidation,
  signLiquidationStep,
  signAllLiquidationSteps,
  seedLifecyclePAR,
  signPARStep,
  signAllPARSteps,
  seedLifecycleProposal,
  seedSampleStudents,
  seedEventAttendance,
  clearAllTestData,
  getRealUploadedSignature,
} from '../services/test-seeder.service';
import { SIGNATORY_SESSION_KEY } from '../../app/auth/hooks/useOfficerAuth';

interface DevDataSeederModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DevDataSeederModal({ isOpen, onClose }: DevDataSeederModalProps) {
  const [activeTab, setActiveTab] = useState<'simulator' | 'signatories' | 'mock_data' | 'purge'>('simulator');
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Live Firestore data streams
  const { data: students = [] } = useStudents();
  const { events = [] } = useAllEvents();
  const { liquidations = [] } = useAllLiquidations();
  const { pars = [] } = useAdminPARs();

  // Live institutional signatories from Firestore
  const [realSignatories, setRealSignatories] = useState<InstitutionalSignatory[]>([]);
  useEffect(() => {
    if (!isOpen) return;
    const unsub = subscribeToSignatories((list) => {
      setRealSignatories(list);
    });
    return () => unsub();
  }, [isOpen]);

  // Current session in localStorage
  const [currentSession, setCurrentSession] = useState<any>(null);
  const refreshActiveSession = () => {
    try {
      const raw = localStorage.getItem(SIGNATORY_SESSION_KEY);
      if (raw) setCurrentSession(JSON.parse(raw));
      else setCurrentSession(null);
    } catch (_) {
      setCurrentSession(null);
    }
  };

  useEffect(() => {
    if (isOpen) refreshActiveSession();
  }, [isOpen]);

  // Selected Activity / Proposal
  const [selectedActivityId, setSelectedActivityId] = useState<string>('');

  const selectedActivity = useMemo(() => {
    if (!selectedActivityId) return events[0] || null;
    return events.find((e) => e.id === selectedActivityId) || events[0] || null;
  }, [events, selectedActivityId]);

  // Look up associated Liquidation for selected activity
  const selectedLiquidation = useMemo(() => {
    if (!selectedActivity) return null;
    const act = selectedActivity as any;
    if (act.liquidationId) {
      return liquidations.find((l) => l.id === act.liquidationId) || null;
    }
    return liquidations.find((l) => l.eventId === selectedActivity.id) || null;
  }, [liquidations, selectedActivity]);

  // Look up associated PAR for selected activity
  const selectedPAR = useMemo(() => {
    if (!selectedActivity) return null;
    const act = selectedActivity as any;
    if (act.parId) {
      return pars.find((p) => p.id === act.parId) || null;
    }
    return pars.find((p) => p.eventId === selectedActivity.id) || null;
  }, [pars, selectedActivity]);

  // Selected Signers from dropdowns
  const [selectedProposalSignerIdx, setSelectedProposalSignerIdx] = useState<number>(0);
  const [selectedLiquidationSignerIdx, setSelectedLiquidationSignerIdx] = useState<number>(0);
  const [selectedPARSignerIdx, setSelectedPARSignerIdx] = useState<number>(0);

  // Proposal approval chain
  const proposalChain: any[] = useMemo(() => {
    if (!selectedActivity) return [];
    return (selectedActivity as any).approvalChain || [];
  }, [selectedActivity]);

  // Liquidation approval chain
  const liquidationChain: any[] = useMemo(() => {
    if (!selectedLiquidation) return [];
    return selectedLiquidation.approvalChain || [];
  }, [selectedLiquidation]);

  // PAR approval chain
  const parChain: any[] = useMemo(() => {
    if (!selectedPAR) return [];
    return selectedPAR.approvalChain || [];
  }, [selectedPAR]);

  // Pending signers list for Proposal
  const pendingProposalSigners = useMemo(() => {
    return proposalChain.filter((s) => s.status === 'current' || s.status === 'waiting');
  }, [proposalChain]);

  // Pending signers list for Liquidation
  const pendingLiquidationSigners = useMemo(() => {
    return liquidationChain.filter((s) => s.status === 'current' || s.status === 'waiting');
  }, [liquidationChain]);

  // Pending signers list for PAR
  const pendingPARSigners = useMemo(() => {
    return parChain.filter((s) => s.status === 'current' || s.status === 'waiting');
  }, [parChain]);

  // Derived lifecycle stage
  const isProposalApproved = useMemo(() => {
    if (!selectedActivity) return false;
    const act = selectedActivity as any;
    return (
      act.proposalStatus === 'approved' ||
      act.status === 'Upcoming' ||
      act.status === 'Active' ||
      act.status === 'Completed' ||
      act.lifecycleStatus === 'completed'
    );
  }, [selectedActivity]);

  const isEventConcluded = useMemo(() => {
    if (!selectedActivity) return false;
    const act = selectedActivity as any;
    return act.lifecycleStatus === 'completed' || act.isConcluded || act.status === 'Completed';
  }, [selectedActivity]);

  const isLiquidationApproved = useMemo(() => {
    if (!selectedLiquidation) return (selectedActivity as any)?.liquidationStatus === 'approved';
    return selectedLiquidation.status === 'approved';
  }, [selectedLiquidation, selectedActivity]);

  const isPARApproved = useMemo(() => {
    if (!selectedPAR) return (selectedActivity as any)?.parStatus === 'approved';
    return selectedPAR.status === 'approved';
  }, [selectedPAR, selectedActivity]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // ── Handlers ──

  const handleSwitchSignatory = (sig: InstitutionalSignatory) => {
    switchActiveSignatorySession(sig);
    refreshActiveSession();
    setStatusMessage({
      type: 'success',
      text: `Impersonating: ${sig.name} (${sig.roleTitle || sig.role}). Active session updated!`,
    });
  };

  const handleClearSession = () => {
    localStorage.removeItem(SIGNATORY_SESSION_KEY);
    localStorage.removeItem('sti_sync_officer_session');
    refreshActiveSession();
    window.dispatchEvent(new Event('storage'));
    setStatusMessage({ type: 'success', text: 'Signatory session cleared.' });
  };

  // 1. Sign chosen person in Proposal
  const handleSignSelectedProposalSigner = async () => {
    if (!selectedActivity || pendingProposalSigners.length === 0) return;
    const target = pendingProposalSigners[selectedProposalSignerIdx] || pendingProposalSigners[0];
    if (!target) return;

    setIsProcessing(true);
    setStatusMessage(null);
    try {
      const res = await signProposalStep(selectedActivity.id, target);
      setStatusMessage({
        type: 'success',
        text: res.isFullyApproved
          ? `Proposal approved by School President! Event is now officially published on the campus calendar.`
          : `Signed and endorsed by ${res.signerName} (${target.roleTitle || target.role})!`,
      });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to sign proposal step.' });
    } finally {
      setIsProcessing(false);
    }
  };

  // 2. Sign ALL in Proposal
  const handleSignAllProposal = async () => {
    if (!selectedActivity) return;
    setIsProcessing(true);
    setStatusMessage(null);
    try {
      const res = await signAllProposalSteps(selectedActivity.id);
      setStatusMessage({
        type: 'success',
        text: `Successfully signed all ${res.totalSigned} pending steps in this proposal! Event is now approved and active on the calendar.`,
      });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to sign all proposal steps.' });
    } finally {
      setIsProcessing(false);
    }
  };

  // 3. Inject Attendance & Conclude
  const handleInjectAttendance = async () => {
    if (!selectedActivity) return;
    setIsProcessing(true);
    setStatusMessage(null);
    try {
      let testStudents = students.filter((s) => (s as any).isTestData);
      if (testStudents.length < 20) {
        testStudents = await seedSampleStudents({ count: 25, track: 'COLLEGE' });
      }
      const res = await seedEventAttendance({
        event: selectedActivity,
        students: testStudents,
        strictTargeting: false,
        attendanceRate: 88,
      });
      setStatusMessage({
        type: 'success',
        text: `Injected ${res.totalInjected} attendance records (${res.attendees} unique attendees).`,
      });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to inject attendance.' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConcludeEvent = async () => {
    if (!selectedActivity) return;
    setIsProcessing(true);
    setStatusMessage(null);
    try {
      await concludeLifecycleEvent(selectedActivity.id);
      setStatusMessage({
        type: 'success',
        text: `Event marked concluded! Financial Liquidation (Form LF-01) is now unlocked.`,
      });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to conclude event.' });
    } finally {
      setIsProcessing(false);
    }
  };

  // 4. Create Liquidation
  const handleCreateLiquidation = async () => {
    if (!selectedActivity) return;
    setIsProcessing(true);
    setStatusMessage(null);
    try {
      const res = await seedLifecycleLiquidation(selectedActivity.id);
      setStatusMessage({
        type: 'success',
        text: `Form LF-01 created (${res.referenceNo}) with expense receipts from Firestore signatories!`,
      });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to create liquidation.' });
    } finally {
      setIsProcessing(false);
    }
  };

  // 5. Sign chosen person in Liquidation
  const handleSignSelectedLiquidationSigner = async () => {
    if (!selectedLiquidation || pendingLiquidationSigners.length === 0) return;
    const target = pendingLiquidationSigners[selectedLiquidationSignerIdx] || pendingLiquidationSigners[0];
    if (!target) return;

    setIsProcessing(true);
    setStatusMessage(null);
    try {
      const res = await signLiquidationStep(selectedLiquidation.id, target);
      setStatusMessage({
        type: 'success',
        text: res.isFullyApproved
          ? `Financial Liquidation fully approved and posted to ledger! Post-Activity Report is now unlocked.`
          : `Signed and verified by ${res.signerName} (${target.roleTitle || target.role})!`,
      });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to sign liquidation step.' });
    } finally {
      setIsProcessing(false);
    }
  };

  // 6. Sign ALL in Liquidation
  const handleSignAllLiquidation = async () => {
    if (!selectedLiquidation) return;
    setIsProcessing(true);
    setStatusMessage(null);
    try {
      const res = await signAllLiquidationSteps(selectedLiquidation.id);
      setStatusMessage({
        type: 'success',
        text: `Successfully signed all ${res.totalSigned} steps on Form LF-01! Posted to ledger and Post-Activity Report unlocked.`,
      });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to sign all liquidation steps.' });
    } finally {
      setIsProcessing(false);
    }
  };

  // 7. Create PAR
  const handleCreatePAR = async () => {
    if (!selectedActivity) return;
    setIsProcessing(true);
    setStatusMessage(null);
    try {
      const res = await seedLifecyclePAR(selectedActivity.id);
      setStatusMessage({
        type: 'success',
        text: `Post-Activity Report (${res.referenceNo}) generated with 4 STI recommendations and gallery photos!`,
      });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to create PAR.' });
    } finally {
      setIsProcessing(false);
    }
  };

  // 8. Sign chosen person in PAR
  const handleSignSelectedPARSigner = async () => {
    if (!selectedPAR || pendingPARSigners.length === 0) return;
    const target = pendingPARSigners[selectedPARSignerIdx] || pendingPARSigners[0];
    if (!target) return;

    setIsProcessing(true);
    setStatusMessage(null);
    try {
      const res = await signPARStep(selectedPAR.id, target);
      setStatusMessage({
        type: 'success',
        text: res.isFullyApproved
          ? `Post-Activity Report fully approved by School President! Automatically archived in EDMS!`
          : `Signed and endorsed by ${res.signerName} (${target.roleTitle || target.role})!`,
      });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to sign PAR step.' });
    } finally {
      setIsProcessing(false);
    }
  };

  // 9. Sign ALL in PAR
  const handleSignAllPAR = async () => {
    if (!selectedPAR) return;
    setIsProcessing(true);
    setStatusMessage(null);
    try {
      const res = await signAllPARSteps(selectedPAR.id);
      setStatusMessage({
        type: 'success',
        text: `Successfully signed all ${res.totalSigned} steps on Post-Activity Report! Fully approved and archived into EDMS repository.`,
      });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to sign all PAR steps.' });
    } finally {
      setIsProcessing(false);
    }
  };

  // 10. Purge
  const handlePurge = async () => {
    if (!window.confirm('Delete all seeded test data (proposals, events, attendance, payables, liquidations, PARs, and EDMS documents)?')) {
      return;
    }
    setIsProcessing(true);
    setStatusMessage(null);
    try {
      const counts = await clearAllTestData();
      setStatusMessage({
        type: 'success',
        text: `Purged ${counts.events} events, ${counts.attendance} scans, ${counts.liquidations} liquidations, ${counts.pars} PARs, and ${counts.documents} EDMS documents!`,
      });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to purge test data.' });
    } finally {
      setIsProcessing(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-5 bg-slate-950/80 backdrop-blur-sm overflow-hidden animate-in fade-in duration-200">
      <div className="flex flex-col w-full max-w-5xl h-[90vh] max-h-[850px] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        
        {/* ── Top Header ── */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 shadow-md shadow-blue-500/20">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-wide">STI Lifecycle Simulator & Signatory Seeder</h2>
                <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 rounded-full">
                  Real Firestore Signatories
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Sign with real Firestore names & signatures: Proposal (AP-01) → Conclude → Liquidation (LF-01) → PAR → EDMS
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {currentSession ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs font-medium">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  Active Signer: <strong>{currentSession.name}</strong> ({currentSession.roleTitle})
                </span>
                <button
                  type="button"
                  onClick={handleClearSession}
                  className="ml-1 text-slate-400 hover:text-white"
                  title="Clear Session"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700 text-slate-400 text-xs">
                <span>No Session Impersonated</span>
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ── Navigation Tabs ── */}
        <div className="flex items-center gap-1 px-6 bg-slate-100 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 overflow-x-auto shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('simulator')}
            className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'simulator'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-white dark:bg-slate-900 shadow-sm'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Zap className="w-4 h-4" />
            Lifecycle Simulator & Signer Picker
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('signatories')}
            className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'signatories'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-white dark:bg-slate-900 shadow-sm'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <KeyRound className="w-4 h-4" />
            Real Firestore Signatories ({realSignatories.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('mock_data')}
            className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'mock_data'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-white dark:bg-slate-900 shadow-sm'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Users className="w-4 h-4" />
            Students & Attendance Injector
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('purge')}
            className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'purge'
                ? 'border-rose-600 text-rose-600 dark:text-rose-400 bg-white dark:bg-slate-900 shadow-sm'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-rose-600'
            }`}
          >
            <Trash2 className="w-4 h-4" />
            Purge Test Data
          </button>
        </div>

        {/* ── Status Message Alert ── */}
        {statusMessage && (
          <div
            className={`flex items-start gap-3 px-6 py-2.5 text-xs font-medium border-b shrink-0 ${
              statusMessage.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
            }`}
          >
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            )}
            <div className="flex-1">{statusMessage.text}</div>
            <button
              type="button"
              onClick={() => setStatusMessage(null)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* ── Tab Content Container ── */}
        <div className="flex-1 p-6 overflow-y-auto space-y-6 min-h-0">

          {/* ══════════════════════════════════════════════════════════════════
              TAB 1: LIFECYCLE SIMULATOR & SIGNER PICKER
             ══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'simulator' && (
            <div className="space-y-6">

              {/* Activity / Proposal Selector Dropdown */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                <div className="flex-1 w-full sm:w-auto">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Select Activity / Proposal to Review & Sign:
                  </label>
                  <select
                    value={selectedActivityId}
                    onChange={(e) => {
                      setSelectedActivityId(e.target.value);
                      setSelectedProposalSignerIdx(0);
                      setSelectedLiquidationSignerIdx(0);
                      setSelectedPARSignerIdx(0);
                    }}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 font-medium"
                  >
                    {events.map((ev: any) => (
                      <option key={ev.id} value={ev.id}>
                        {ev.title} ({ev.referenceId || ev.referenceNo || ev.id.slice(0, 10)}) — Status: {ev.lifecycleStatus || ev.status || 'Active'}
                      </option>
                    ))}
                  </select>
                </div>

                <Button
                  type="button"
                  onClick={async () => {
                    setIsProcessing(true);
                    setStatusMessage(null);
                    try {
                      const res = await seedLifecycleProposal();
                      setSelectedActivityId(res.proposalId);
                      setStatusMessage({
                        type: 'success',
                        text: `New Activity Proposal created (${res.referenceNo}) using active Firestore signatories!`,
                      });
                    } catch (err: any) {
                      setStatusMessage({ type: 'error', text: err.message || 'Failed to create proposal.' });
                    } finally {
                      setIsProcessing(false);
                    }
                  }}
                  disabled={isProcessing}
                  className="shrink-0 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
                >
                  {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5" />}
                  + New Proposal (Real Signatories)
                </Button>
              </div>

              {selectedActivity ? (
                <div className="space-y-6">

                  {/* ────────────────────────────────────────────────────────────
                      SECTION 1: ACTIVITY PROPOSAL (FORM AP-01) STAGES & SIGNERS
                     ──────────────────────────────────────────────────────────── */}
                  <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                      <div className="flex items-center gap-2.5">
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950 text-blue-600 font-bold text-xs">
                          1
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                              Activity Proposal (Form AP-01) Approval Stages
                            </h3>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                                isProposalApproved
                                  ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                                  : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                              }`}
                            >
                              {isProposalApproved ? 'Approved & Published' : 'Under Review'}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500">
                            Real signatories assigned to sign this proposal from Firestore database:
                          </p>
                        </div>
                      </div>

                      {/* Open Portal Link */}
                      <a
                        href="/signatory/endorsements"
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
                      >
                        Open Signatory Portal <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>

                    {/* Proposal Approval Chain Roster */}
                    {proposalChain.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        {proposalChain.map((step, idx) => {
                          const isDone = step.status === 'endorsed' || step.status === 'approved';
                          const isCurrent = step.status === 'current';
                          return (
                            <div
                              key={step.id || idx}
                              className={`p-3 rounded-xl border transition-all ${
                                isDone
                                  ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800'
                                  : isCurrent
                                  ? 'bg-blue-50/70 dark:bg-blue-950/30 border-blue-400 dark:border-blue-700 ring-1 ring-blue-500/30'
                                  : 'bg-slate-50/60 dark:bg-slate-800/30 border-slate-200 dark:border-slate-800'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-1 mb-1">
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                  Stage {step.stageIndex ?? 1}
                                </span>
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold uppercase ${
                                    isDone
                                      ? 'bg-emerald-600 text-white'
                                      : isCurrent
                                      ? 'bg-blue-600 text-white animate-pulse'
                                      : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                                  }`}
                                >
                                  {step.status}
                                </span>
                              </div>

                              <div className="font-bold text-xs text-slate-900 dark:text-slate-100 mb-0.5">
                                {step.signatoryName || 'Institutional Signatory'}
                              </div>
                              <div className="text-[11px] text-blue-600 dark:text-blue-400 font-medium mb-1">
                                {step.roleTitle || step.role}
                              </div>

                              {/* Signature Status */}
                              {isDone ? (
                                <div className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                                  <Check className="w-3 h-3 stroke-[3]" /> Signed {step.signedAt ? new Date(step.signedAt).toLocaleDateString() : ''}
                                </div>
                              ) : (
                                <div className="text-[10px] text-slate-400">
                                  Action: <strong>{step.actionType || 'endorse'}</strong>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-xs text-slate-500 italic">No approval steps found on this proposal document.</div>
                    )}

                    {/* Proposal Action Box: Choose Signatory or Sign All */}
                    {!isProposalApproved && pendingProposalSigners.length > 0 && (
                      <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex-1">
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                            Choose who will sign this proposal:
                          </label>
                          <select
                            value={selectedProposalSignerIdx}
                            onChange={(e) => setSelectedProposalSignerIdx(Number(e.target.value))}
                            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-medium"
                          >
                            {pendingProposalSigners.map((s, idx) => (
                              <option key={s.id || idx} value={idx}>
                                [Stage {s.stageIndex ?? 1}] {s.signatoryName} ({s.roleTitle || s.role}) — Status: {s.status}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            type="button"
                            onClick={handleSignSelectedProposalSigner}
                            disabled={isProcessing}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
                          >
                            {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />}
                            Sign as Selected Person
                          </Button>

                          <Button
                            type="button"
                            onClick={handleSignAllProposal}
                            disabled={isProcessing}
                            variant="outline"
                            className="text-xs font-bold border-slate-300 dark:border-slate-700"
                          >
                            ⚡ Sign All in this Proposal
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ────────────────────────────────────────────────────────────
                      SECTION 2: EVENT ATTENDANCE SCANS & CONCLUDE
                     ──────────────────────────────────────────────────────────── */}
                  {isProposalApproved && (
                    <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                      <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                        <div className="flex items-center gap-2.5">
                          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-950 text-indigo-600 font-bold text-xs">
                            2
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                                Event Attendance & Event Conclusion
                              </h3>
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                                  isEventConcluded
                                    ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                                    : 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                                }`}
                              >
                                {isEventConcluded ? 'Event Concluded' : 'Active / In-Progress'}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500">
                              Turnout: <strong>{(selectedActivity as any).attendeesCount || (selectedActivity as any).actualAttendees || 0}</strong> verified scans recorded.
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            onClick={handleInjectAttendance}
                            disabled={isProcessing}
                            className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
                          >
                            <QrCode className="w-3.5 h-3.5 mr-1.5" />
                            Inject 40–80 Student Scans
                          </Button>

                          {!isEventConcluded && (
                            <Button
                              type="button"
                              onClick={handleConcludeEvent}
                              disabled={isProcessing}
                              className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold"
                            >
                              <Clock className="w-3.5 h-3.5 mr-1.5" />
                              Mark Event Concluded
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ────────────────────────────────────────────────────────────
                      SECTION 3: FINANCIAL LIQUIDATION (FORM LF-01) STAGES & SIGNERS
                     ──────────────────────────────────────────────────────────── */}
                  {isEventConcluded && (
                    <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                        <div className="flex items-center gap-2.5">
                          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-600 font-bold text-xs">
                            3
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                                Financial Liquidation (Form LF-01) Approval Stages
                              </h3>
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                                  isLiquidationApproved
                                    ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                                    : selectedLiquidation
                                    ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                                }`}
                              >
                                {isLiquidationApproved ? 'Approved & Posted to Ledger' : selectedLiquidation ? 'Under Review' : 'Ready to Create'}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500">
                              Real institutional accountant and executive approvers assigned from Firestore:
                            </p>
                          </div>
                        </div>

                        {!selectedLiquidation && (
                          <Button
                            type="button"
                            onClick={handleCreateLiquidation}
                            disabled={isProcessing}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                          >
                            <Wallet className="w-3.5 h-3.5 mr-1.5" />
                            + Create Form LF-01 Liquidation
                          </Button>
                        )}
                      </div>

                      {/* Liquidation Roster */}
                      {selectedLiquidation && liquidationChain.length > 0 && (
                        <>
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                            {liquidationChain.map((step, idx) => {
                              const isDone = step.status === 'endorsed' || step.status === 'approved';
                              const isCurrent = step.status === 'current';
                              return (
                                <div
                                  key={step.id || idx}
                                  className={`p-3 rounded-xl border transition-all ${
                                    isDone
                                      ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800'
                                      : isCurrent
                                      ? 'bg-blue-50/70 dark:bg-blue-950/30 border-blue-400 dark:border-blue-700 ring-1 ring-blue-500/30'
                                      : 'bg-slate-50/60 dark:bg-slate-800/30 border-slate-200 dark:border-slate-800'
                                  }`}
                                >
                                  <div className="flex items-start justify-between gap-1 mb-1">
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                      Stage {step.stageIndex ?? 1}
                                    </span>
                                    <span
                                      className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold uppercase ${
                                        isDone
                                          ? 'bg-emerald-600 text-white'
                                          : isCurrent
                                          ? 'bg-blue-600 text-white animate-pulse'
                                          : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                                      }`}
                                    >
                                      {step.status}
                                    </span>
                                  </div>

                                  <div className="font-bold text-xs text-slate-900 dark:text-slate-100 mb-0.5">
                                    {step.signatoryName || 'Institutional Accountant'}
                                  </div>
                                  <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mb-1">
                                    {step.roleTitle || step.role}
                                  </div>

                                  {isDone ? (
                                    <div className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                                      <Check className="w-3 h-3 stroke-[3]" /> Audited & Approved
                                    </div>
                                  ) : (
                                    <div className="text-[10px] text-slate-400">
                                      Action: <strong>{step.actionType || 'check'}</strong>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          {/* Liquidation Action Box */}
                          {!isLiquidationApproved && pendingLiquidationSigners.length > 0 && (
                            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 flex flex-col md:flex-row md:items-center justify-between gap-4">
                              <div className="flex-1">
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                                  Choose who will sign this liquidation:
                                </label>
                                <select
                                  value={selectedLiquidationSignerIdx}
                                  onChange={(e) => setSelectedLiquidationSignerIdx(Number(e.target.value))}
                                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-medium"
                                >
                                  {pendingLiquidationSigners.map((s, idx) => (
                                    <option key={s.id || idx} value={idx}>
                                      [Stage {s.stageIndex ?? 1}] {s.signatoryName} ({s.roleTitle || s.role}) — Status: {s.status}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <Button
                                  type="button"
                                  onClick={handleSignSelectedLiquidationSigner}
                                  disabled={isProcessing}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                                  Sign Liquidation as Selected Person
                                </Button>

                                <Button
                                  type="button"
                                  onClick={handleSignAllLiquidation}
                                  disabled={isProcessing}
                                  variant="outline"
                                  className="text-xs font-bold border-slate-300 dark:border-slate-700"
                                >
                                  ⚡ Sign All in this Liquidation
                                </Button>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {/* ────────────────────────────────────────────────────────────
                      SECTION 4: POST-ACTIVITY REPORT (FORM PAR) STAGES & SIGNERS
                     ──────────────────────────────────────────────────────────── */}
                  {isLiquidationApproved && (
                    <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                        <div className="flex items-center gap-2.5">
                          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-950 text-purple-600 font-bold text-xs">
                            4
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                                Post-Activity Report (Form PAR) Approval Stages
                              </h3>
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                                  isPARApproved
                                    ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                                    : selectedPAR
                                    ? 'bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                                }`}
                              >
                                {isPARApproved ? 'Archived in EDMS' : selectedPAR ? 'Under Review' : 'Ready to Create'}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500">
                              Real institutional Program Head, Dean, and President assigned from Firestore:
                            </p>
                          </div>
                        </div>

                        {!selectedPAR && (
                          <Button
                            type="button"
                            onClick={handleCreatePAR}
                            disabled={isProcessing}
                            className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold"
                          >
                            <FileCheck2 className="w-3.5 h-3.5 mr-1.5" />
                            + Create Form PAR (4 Recommendations)
                          </Button>
                        )}
                      </div>

                      {/* PAR Roster */}
                      {selectedPAR && parChain.length > 0 && (
                        <>
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                            {parChain.map((step, idx) => {
                              const isDone = step.status === 'endorsed' || step.status === 'approved';
                              const isCurrent = step.status === 'current';
                              return (
                                <div
                                  key={step.id || idx}
                                  className={`p-3 rounded-xl border transition-all ${
                                    isDone
                                      ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800'
                                      : isCurrent
                                      ? 'bg-blue-50/70 dark:bg-blue-950/30 border-blue-400 dark:border-blue-700 ring-1 ring-blue-500/30'
                                      : 'bg-slate-50/60 dark:bg-slate-800/30 border-slate-200 dark:border-slate-800'
                                  }`}
                                >
                                  <div className="flex items-start justify-between gap-1 mb-1">
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                      Stage {step.stageIndex ?? 1}
                                    </span>
                                    <span
                                      className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold uppercase ${
                                        isDone
                                          ? 'bg-emerald-600 text-white'
                                          : isCurrent
                                          ? 'bg-blue-600 text-white animate-pulse'
                                          : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                                      }`}
                                    >
                                      {step.status}
                                    </span>
                                  </div>

                                  <div className="font-bold text-xs text-slate-900 dark:text-slate-100 mb-0.5">
                                    {step.signatoryName || 'Institutional Signatory'}
                                  </div>
                                  <div className="text-[11px] text-purple-600 dark:text-purple-400 font-medium mb-1">
                                    {step.roleTitle || step.role}
                                  </div>

                                  {isDone ? (
                                    <div className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                                      <Check className="w-3 h-3 stroke-[3]" /> Endorsed & Approved
                                    </div>
                                  ) : (
                                    <div className="text-[10px] text-slate-400">
                                      Action: <strong>{step.actionType || 'endorse'}</strong>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          {/* PAR Action Box */}
                          {!isPARApproved && pendingPARSigners.length > 0 && (
                            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 flex flex-col md:flex-row md:items-center justify-between gap-4">
                              <div className="flex-1">
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                                  Choose who will sign this PAR:
                                </label>
                                <select
                                  value={selectedPARSignerIdx}
                                  onChange={(e) => setSelectedPARSignerIdx(Number(e.target.value))}
                                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-medium"
                                >
                                  {pendingPARSigners.map((s, idx) => (
                                    <option key={s.id || idx} value={idx}>
                                      [Stage {s.stageIndex ?? 1}] {s.signatoryName} ({s.roleTitle || s.role}) — Status: {s.status}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <Button
                                  type="button"
                                  onClick={handleSignSelectedPARSigner}
                                  disabled={isProcessing}
                                  className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                                  Sign PAR as Selected Person
                                </Button>

                                <Button
                                  type="button"
                                  onClick={handleSignAllPAR}
                                  disabled={isProcessing}
                                  variant="outline"
                                  className="text-xs font-bold border-slate-300 dark:border-slate-700"
                                >
                                  ⚡ Sign All in this PAR
                                </Button>
                              </div>
                            </div>
                          )}

                          {isPARApproved && (
                            <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between">
                              <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 text-xs font-bold">
                                <Archive className="w-4 h-4 text-emerald-600" />
                                Post-Activity Report 100% Cleared and Archived in EDMS!
                              </div>
                              <a
                                href="/admin/edms"
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:underline"
                              >
                                View in EDMS Vault <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}

                </div>
              ) : (
                <div className="p-12 text-center text-slate-500">
                  No activity found. Click "+ New Proposal (Real Signatories)" to start.
                </div>
              )}

            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB 2: REAL FIRESTORE SIGNATORIES LIST & SWITCHER
             ══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'signatories' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-xs text-blue-900 dark:text-blue-300">
                <strong>Real Firestore Signatories ({realSignatories.length}):</strong> Live accounts directly loaded from your <code>institutional_signatories</code> collection. You can click <strong>"Log In As"</strong> to instantly impersonate any of them.
              </div>

              {realSignatories.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {realSignatories.map((sig) => {
                    const isCurrent = currentSession?.email?.toLowerCase() === sig.email.toLowerCase();
                    const hasUploadedSignature = Boolean(sig.signatureUrl || sig.signatureDataUrl);
                    return (
                      <div
                        key={sig.id}
                        className={`p-4 rounded-xl border transition-all ${
                          isCurrent
                            ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-400 dark:border-emerald-700 shadow-md ring-1 ring-emerald-400/50'
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm'
                        }`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">{sig.name}</h4>
                            <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                              {sig.roleTitle || sig.role}
                            </span>
                          </div>
                          {isCurrent && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-emerald-600 text-white">
                              Active
                            </span>
                          )}
                        </div>

                        <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400 mb-3">
                          <div>
                            <strong>Dept:</strong> {sig.department || 'Institutional'}
                          </div>
                          <div>
                            <strong>Email:</strong> <code className="text-slate-800 dark:text-slate-200">{sig.email}</code>
                          </div>
                          <div>
                            <strong>Role Scope:</strong> {sig.applicableScope || 'both'}
                          </div>
                          <div className="flex items-center gap-1">
                            <strong>Signature:</strong>{' '}
                            {hasUploadedSignature ? (
                              <span className="text-emerald-600 font-semibold flex items-center gap-0.5">
                                <Check className="w-3 h-3 stroke-[3]" /> Uploaded in Firestore
                              </span>
                            ) : (
                              <span className="text-amber-600 italic">Auto-Calligraphic Fallback</span>
                            )}
                          </div>
                        </div>

                        {/* Signature Preview Thumbnail */}
                        <div className="p-2 mb-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 flex items-center justify-center h-14 overflow-hidden">
                          {hasUploadedSignature ? (
                            <img
                              src={sig.signatureUrl || sig.signatureDataUrl}
                              alt={sig.name}
                              className="max-h-full object-contain"
                            />
                          ) : (
                            <span className="text-[10px] text-slate-400 italic">No custom image uploaded</span>
                          )}
                        </div>

                        <Button
                          type="button"
                          onClick={() => handleSwitchSignatory(sig)}
                          variant={isCurrent ? 'outline' : 'default'}
                          className={`w-full text-xs font-semibold ${
                            isCurrent
                              ? 'border-emerald-500 text-emerald-700 dark:text-emerald-300'
                              : 'bg-blue-600 hover:bg-blue-700 text-white'
                          }`}
                        >
                          <KeyRound className="w-3.5 h-3.5 mr-1.5" />
                          {isCurrent ? 'Currently Active' : `Log In As ${sig.name.split(' ')[0]}`}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-12 text-center text-slate-500 border border-dashed rounded-xl">
                  No institutional signatories found in Firestore. Configure them under Admin Settings → Signatories Management.
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB 3: STUDENTS & ATTENDANCE INJECTOR
             ══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'mock_data' && (
            <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Seed Realistic STI Students
                </h3>
              </div>
              <p className="text-xs text-slate-500">
                Quickly inject 20 sample students with real STI student numbers and courses into Firestore:
              </p>

              <Button
                type="button"
                onClick={async () => {
                  setIsProcessing(true);
                  setStatusMessage(null);
                  try {
                    const res = await seedSampleStudents({ count: 20, track: 'COLLEGE' });
                    setStatusMessage({ type: 'success', text: `Created ${res.length} sample student accounts in Firestore!` });
                  } catch (err: any) {
                    setStatusMessage({ type: 'error', text: err.message || 'Failed to seed students.' });
                  } finally {
                    setIsProcessing(false);
                  }
                }}
                disabled={isProcessing}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
              >
                {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Users className="w-3.5 h-3.5 mr-1.5" />}
                Inject 20 Students Now
              </Button>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB 4: PURGE TEST DATA
             ══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'purge' && (
            <div className="p-6 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/20 space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-900/40 text-rose-600">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-rose-900 dark:text-rose-200">
                    Purge All Seeded Test Data
                  </h3>
                  <p className="text-xs text-rose-700 dark:text-rose-400">
                    Safely removes mock activities, attendance, liquidations, and PARs marked with <code>isTestData: true</code>.
                  </p>
                </div>
              </div>

              <Button
                type="button"
                onClick={handlePurge}
                disabled={isProcessing}
                className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
              >
                {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Trash2 className="w-3.5 h-3.5 mr-1.5" />}
                Purge All Seeded Test Data Now
              </Button>
            </div>
          )}

        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-between px-6 py-3.5 bg-slate-50 dark:bg-slate-900/90 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Firestore Linked: STI College Ormoc Database</span>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="text-xs font-semibold"
          >
            Close
          </Button>
        </div>

      </div>
    </div>,
    document.body
  );
}
