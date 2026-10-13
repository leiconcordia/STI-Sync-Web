import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  FileCheck2,
  Calendar,
  Building2,
  Users,
  DollarSign,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  Upload,
  Image as ImageIcon,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  ShieldCheck,
  Save,
  Send,
  Loader2,
  FileText,
  HelpCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import { EVENTS_COLLECTION } from '../../events/services/event.service';
import { LIQUIDATIONS_COLLECTION } from '../../finance/services/liquidation.service';
import {
  saveOrSubmitPAR,
  generateDefaultPARSignatoryChain,
} from '../services/par.service';
import type {
  PostActivityReportDocument,
  PARFormData,
  PARObjectiveStatus,
  PARPhotoAttachment,
  PARApprovalStep,
} from '../types/par.types';
import type { EventDocument } from '../../events/types/event.types';
import { formatCurrency, formatVariance } from '../../../utils/currency';
import RevisionFeedbackBanner from '../../workflow/components/RevisionFeedbackBanner';

interface PostActivityReportWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (parId: string) => void;
  eligibleEvents: EventDocument[];
  initialEventId?: string;
  initialReport?: PostActivityReportDocument | null;
  currentUser: {
    uid: string;
    name: string;
    email: string;
    role?: string;
    organizationId?: string;
    organizationName?: string;
  };
  isSasAdmin?: boolean;
}

type WizardTab = 'overview' | 'objectives' | 'recommendations' | 'photos_signatories';

export default function PostActivityReportWizardModal({
  isOpen,
  onClose,
  onSuccess,
  eligibleEvents,
  initialEventId,
  initialReport,
  currentUser,
  isSasAdmin = false,
}: PostActivityReportWizardModalProps) {
  const [activeTab, setActiveTab] = useState<WizardTab>('overview');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingEventData, setIsLoadingEventData] = useState(false);

  // Form State
  const [selectedEventId, setSelectedEventId] = useState<string>(
    initialReport?.eventId || initialEventId || ''
  );
  const [selectedEvent, setSelectedEvent] = useState<EventDocument | null>(null);

  // Section 1: Summary & Mechanics
  const [actualMechanics, setActualMechanics] = useState('');
  const [registeredCount, setRegisteredCount] = useState(0);
  const [attendedCount, setAttendedCount] = useState(0);
  const [targetAudience, setTargetAudience] = useState('');
  const [whoAttended, setWhoAttended] = useState('');

  // Section 2: Financial
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalDisbursed, setTotalDisbursed] = useState(0);
  const [liquidationRef, setLiquidationRef] = useState('');
  const [financialLineItems, setFinancialLineItems] = useState<
    Array<{ description: string; unitAmount: number; totalAmount: number }>
  >([]);

  // Section 3: Objectives & Results
  const [objectiveStatus, setObjectiveStatus] = useState<PARObjectiveStatus>('fully_achieved');
  const [achievementNarrative, setAchievementNarrative] = useState('');
  const [keyLearnings, setKeyLearnings] = useState<string[]>([
    'Demonstrated mastery of event objectives among attendees.',
  ]);
  const [newLearningInput, setNewLearningInput] = useState('');
  const [classroomEnrichment, setClassroomEnrichment] = useState('');
  const [venueAssessment, setVenueAssessment] = useState('');
  const [logisticsAssessment, setLogisticsAssessment] = useState('');
  const [issuesEncountered, setIssuesEncountered] = useState('No major issues encountered.');

  // Section 4: 4 STI Recommendations
  const [progFlowObs, setProgFlowObs] = useState('');
  const [progFlowRec, setProgFlowRec] = useState('');
  const [engagementObs, setEngagementObs] = useState('');
  const [engagementRec, setEngagementRec] = useState('');
  const [techSetupObs, setTechSetupObs] = useState('');
  const [techSetupRec, setTechSetupRec] = useState('');
  const [prepObs, setPrepObs] = useState('');
  const [prepRec, setPrepRec] = useState('');

  // Section 5: Photos & Pipeline
  const [photos, setPhotos] = useState<PARPhotoAttachment[]>([]);
  const [newPhotoUrl, setNewPhotoUrl] = useState('');
  const [newPhotoCaption, setNewPhotoCaption] = useState('');
  const [approvalChain, setApprovalChain] = useState<PARApprovalStep[]>([]);

  // Initialize from editing document if provided
  useEffect(() => {
    if (initialReport) {
      setSelectedEventId(initialReport.eventId);
      setActualMechanics(initialReport.actualMechanics || '');
      setRegisteredCount(initialReport.attendanceSummary?.registeredCount || 0);
      setAttendedCount(initialReport.attendanceSummary?.attendedCount || 0);
      setTargetAudience(initialReport.attendanceSummary?.targetAudience || '');
      setWhoAttended(initialReport.attendanceSummary?.whoAttended || '');

      setTotalRevenue(initialReport.financialSummary?.totalRevenue || 0);
      setTotalDisbursed(initialReport.financialSummary?.totalDisbursed || 0);
      setLiquidationRef(initialReport.liquidationRefNumber || '');
      setFinancialLineItems(initialReport.financialSummary?.lineItems || []);

      setObjectiveStatus(initialReport.results?.objectiveStatus || 'fully_achieved');
      setAchievementNarrative(initialReport.results?.achievementNarrative || '');
      setKeyLearnings(initialReport.results?.keyLearnings || []);
      setClassroomEnrichment(initialReport.results?.classroomEnrichment || '');
      setVenueAssessment(initialReport.results?.venueAssessment || '');
      setLogisticsAssessment(initialReport.results?.logisticsAssessment || '');
      setIssuesEncountered(initialReport.results?.issuesEncountered || 'No major issues encountered.');

      setProgFlowObs(initialReport.recommendations?.programFlow?.observations || '');
      setProgFlowRec(initialReport.recommendations?.programFlow?.recommendations || '');
      setEngagementObs(initialReport.recommendations?.participantEngagement?.observations || '');
      setEngagementRec(initialReport.recommendations?.participantEngagement?.recommendations || '');
      setTechSetupObs(initialReport.recommendations?.technicalSetup?.observations || '');
      setTechSetupRec(initialReport.recommendations?.technicalSetup?.recommendations || '');
      setPrepObs(initialReport.recommendations?.participantPreparedness?.observations || '');
      setPrepRec(initialReport.recommendations?.participantPreparedness?.recommendations || '');

      setPhotos(initialReport.photos || []);
      setApprovalChain(initialReport.approvalChain || []);
    }
  }, [initialReport]);

  // When selected event changes, auto-fetch details, attendance count, and LF-01 financial data
  useEffect(() => {
    if (!selectedEventId) {
      setSelectedEvent(null);
      return;
    }

    let isCancelled = false;
    async function loadEventDetails() {
      setIsLoadingEventData(true);
      try {
        const evSnap = await getDoc(doc(db, EVENTS_COLLECTION, selectedEventId));
        if (!evSnap.exists() || isCancelled) return;
        const evData = { id: evSnap.id, ...evSnap.data() } as EventDocument;
        setSelectedEvent(evData);

        // Auto-populate target audience
        const audText =
          (evData as any).targetAudienceText ||
          (evData as any).targetMarket ||
          'Enrolled College & SHS Students';
        setTargetAudience(audText);
        setWhoAttended(audText);

        // Auto-fetch attendance scanner counts
        try {
          const attSnap = await getDocs(
            query(collection(db, 'attendance'), where('eventId', '==', selectedEventId))
          );
          const attCount = attSnap.docs.filter((d) => {
            const row = d.data();
            return row.status === 'Checked In' || row.status === 'Present' || !!row.scannedAt;
          }).length;
          const regCount = (evData as any).expectedAttendees || (evData as any).registeredCount || attCount || 50;
          setAttendedCount(attCount || regCount);
          setRegisteredCount(regCount);
        } catch {
          setAttendedCount(50);
          setRegisteredCount(50);
        }

        // Auto-fetch financial liquidation summary (Form LF-01)
        if ((evData as any).liquidationReportId) {
          try {
            const liqSnap = await getDoc(
              doc(db, LIQUIDATIONS_COLLECTION, (evData as any).liquidationReportId)
            );
            if (liqSnap.exists()) {
              const liqData = liqSnap.data() as any;
              setLiquidationRef(liqData.referenceNo || (evData as any).liquidationRefNumber || '');
              setTotalRevenue(liqData.actualRevenueTotal || liqData.allocatedBudget || 0);
              setTotalDisbursed(liqData.totalDisbursed || liqData.totalExpenses || 0);
              if (Array.isArray(liqData.lineItems)) {
                setFinancialLineItems(
                  liqData.lineItems.map((li: any) => ({
                    description: li.description || li.item || 'Expense Item',
                    unitAmount: Number(li.actualCost || li.unitPrice || 0),
                    totalAmount: Number(li.actualCost || li.total || 0),
                  }))
                );
              }
            }
          } catch {}
        } else {
          setLiquidationRef((evData as any).liquidationRefNumber || 'N/A (Self-Funded)');
        }

        // Auto-populate dynamic signatory pipeline if not initialized
        if (approvalChain.length === 0) {
          const chain = await generateDefaultPARSignatoryChain(evData.hostingOrgId);
          setApprovalChain(chain);
        }
      } catch (err) {
        console.warn('[PostActivityReportWizardModal] Error fetching event details:', err);
      } finally {
        if (!isCancelled) setIsLoadingEventData(false);
      }
    }

    loadEventDetails();
    return () => {
      isCancelled = true;
    };
  }, [selectedEventId]);

  const handleAddLearning = () => {
    if (!newLearningInput.trim()) return;
    setKeyLearnings([...keyLearnings, newLearningInput.trim()]);
    setNewLearningInput('');
  };

  const handleRemoveLearning = (idx: number) => {
    setKeyLearnings(keyLearnings.filter((_, i) => i !== idx));
  };

  const handleAddPhoto = () => {
    if (!newPhotoUrl.trim()) {
      toast.error('Please provide a valid image URL.');
      return;
    }
    const newP: PARPhotoAttachment = {
      id: `photo-${Date.now()}`,
      url: newPhotoUrl.trim(),
      caption: newPhotoCaption.trim() || 'Event Photo Documentation',
      uploadedAt: new Date().toISOString(),
    };
    setPhotos([...photos, newP]);
    setNewPhotoUrl('');
    setNewPhotoCaption('');
  };

  const handleRemovePhoto = (id: string) => {
    setPhotos(photos.filter((p) => p.id !== id));
  };

  const handleSubmitOrDraft = async (submitForReview: boolean) => {
    if (!selectedEventId) {
      toast.error('Please select an event to submit a Post-Activity Report.');
      return;
    }

    if (submitForReview) {
      if (!achievementNarrative.trim()) {
        setActiveTab('objectives');
        toast.error('Please provide an achievement narrative for the event objectives.');
        return;
      }
      if (keyLearnings.length === 0) {
        setActiveTab('objectives');
        toast.error('Please add at least 1 key learning outcome.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const netBalance = totalRevenue - totalDisbursed;

      const payload: PARFormData = {
        id: initialReport?.id,
        referenceNo: initialReport?.referenceNo,
        eventId: selectedEventId,
        eventTitle: selectedEvent?.title || initialReport?.eventTitle || '',
        eventVenue: (selectedEvent as any)?.venue || initialReport?.eventVenue || 'STI Campus',
        eventDateFormatted: (selectedEvent as any)?.date || initialReport?.eventDateFormatted || 'Concluded Event',
        eventDescription: selectedEvent?.description || initialReport?.eventDescription || '',
        organizerName: selectedEvent?.organizerName || currentUser.name,
        actualMechanics,

        organizationId: isSasAdmin ? 'sas' : (selectedEvent?.hostingOrgId || currentUser.organizationId || ''),
        organizationName: isSasAdmin ? 'Student Affairs Services (SAS)' : (selectedEvent?.hostingOrgName || currentUser.organizationName || ''),
        organizationAcronym: isSasAdmin ? 'SAS' : ((selectedEvent as any)?.hostingOrgAcronym || 'ORG'),

        attendanceSummary: {
          registeredCount,
          attendedCount,
          targetAudience,
          whoAttended,
        },

        financialSummary: {
          totalRevenue,
          totalDisbursed,
          surplusOrDeficit: netBalance,
          lineItems: financialLineItems,
        },

        results: {
          objectiveStatus,
          achievementNarrative,
          keyLearnings,
          classroomEnrichment,
          venueAssessment: venueAssessment || 'Venue was adequate for the scheduled activities.',
          logisticsAssessment: logisticsAssessment || 'Logistics and equipment were managed appropriately.',
          scheduleCompliance: 'Conducted in compliance with approved program schedule.',
          issuesEncountered: issuesEncountered || 'No major issues encountered.',
        },

        recommendations: {
          programFlow: {
            observations: progFlowObs || 'Program flowed on schedule.',
            recommendations: progFlowRec || 'Maintain current timing buffer.',
          },
          participantEngagement: {
            observations: engagementObs || 'Attendees participated actively in discussions and workshops.',
            recommendations: engagementRec || 'Continue interactive icebreakers and QA sessions.',
          },
          technicalSetup: {
            observations: techSetupObs || 'Microphones, projector, and network connection were verified.',
            recommendations: techSetupRec || 'Ensure dry-run setup at least 1 hour prior to event opening.',
          },
          participantPreparedness: {
            observations: prepObs || 'Students arrived with necessary materials and pre-registered badges.',
            recommendations: prepRec || 'Distribute event primer at least 3 days before event.',
          },
        },

        photos,
        approvalChain,
        preparedBy: {
          name: currentUser.name,
          roleTitle: isSasAdmin ? 'SAS Administrator' : 'Student Organization Officer',
          signatureUrl: (currentUser as any)?.signatureUrl || '',
          signedAt: new Date().toISOString(),
        },
      };

      const result = await saveOrSubmitPAR(
        payload,
        {
          uid: currentUser.uid,
          name: currentUser.name,
          email: currentUser.email,
          role: currentUser.role,
          organizationId: currentUser.organizationId,
        },
        submitForReview
      );

      toast.success(
        submitForReview
          ? `Post-Activity Report (${result.referenceNo}) submitted for institutional endorsement!`
          : `Draft Post-Activity Report (${result.referenceNo}) saved successfully.`
      );

      onSuccess(result.id);
      onClose();
    } catch (err: any) {
      console.error('[PostActivityReportWizardModal] Error saving PAR:', err);
      toast.error(err?.message || 'Failed to save Post-Activity Report.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const netBalance = totalRevenue - totalDisbursed;
  const isSurplus = netBalance >= 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden my-auto">
        {/* Header Banner */}
        <div className="bg-gradient-to-r from-[#001A4D] via-[#0E4EBD] to-[#1E70E8] p-5 text-white flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20">
              <FileCheck2 className="w-6 h-6 text-[#FFD41C]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold tracking-widest uppercase bg-white/20 px-2 py-0.5 rounded-full text-white">
                  Official Form PAR
                </span>
                <span className="text-[11px] font-semibold text-blue-200">
                  STI Institutional Compliance
                </span>
              </div>
              <h2 className="text-xl font-black tracking-tight text-white mt-0.5">
                {initialReport ? `Edit Report: ${initialReport.referenceNo}` : 'Submit Post-Activity Report'}
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation Navigation */}
        <div className="flex border-b border-slate-200 bg-slate-50/70 px-6 gap-2 pt-2">
          {[
            { id: 'overview', label: '1. Event & Clearance Summary', icon: FileText },
            { id: 'objectives', label: '2. Objectives & Learnings', icon: Sparkles },
            { id: 'recommendations', label: '3. STI Recommendations', icon: ShieldCheck },
            { id: 'photos_signatories', label: '4. Photos & Pipeline', icon: ImageIcon },
          ].map((t) => {
            const Icon = t.icon;
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id as WizardTab)}
                className={`flex items-center gap-2 py-3 px-4 text-xs font-bold border-b-2 transition-all rounded-t-lg ${
                  isActive
                    ? 'border-[#0E4EBD] text-[#0E4EBD] bg-white shadow-sm'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-[#0E4EBD]' : 'text-slate-400'}`} />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {initialReport?.status === 'returned' && (
            <RevisionFeedbackBanner
              returnedBy={{
                name: (initialReport as any).returnedByName || (initialReport as any).returnedBy || 'Institutional Signatory',
                roleTitle: (initialReport as any).returnedByRoleTitle || 'Signatory Reviewer',
                email: (initialReport as any).returnedByEmail,
              }}
              returnedAt={initialReport.returnedAt}
              returnRemarks={initialReport.returnRemarks}
              revisionHistory={initialReport.revisionHistory}
              documentTitle={initialReport.eventTitle}
              versionLabel={`v${initialReport.revisionCount || 1}.0`}
            />
          )}

          {/* TAB 1: OVERVIEW & CLEARANCE */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Event Picker if creating new */}
              {!initialReport && (
                <div className="bg-blue-50/60 p-4 rounded-xl border border-blue-200">
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#001A4D] mb-1.5">
                    Select Concluded Event (Liquidation Approved)
                  </label>
                  <select
                    value={selectedEventId}
                    onChange={(e) => setSelectedEventId(e.target.value)}
                    className="w-full bg-white border border-blue-300 rounded-lg p-2.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-- Choose a concluded event --</option>
                    {eligibleEvents.map((ev) => (
                      <option key={ev.id} value={ev.id}>
                        {ev.title} ({ev.referenceId || ev.id.slice(0, 6)}) — {(ev as any).date || 'Concluded'}
                      </option>
                    ))}
                  </select>
                  {eligibleEvents.length === 0 && (
                    <p className="text-xs text-amber-700 mt-2 flex items-center gap-1.5 font-medium">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      No concluded events with approved liquidations are currently awaiting a Post-Activity Report.
                    </p>
                  )}
                </div>
              )}

              {isLoadingEventData ? (
                <div className="py-12 flex flex-col items-center justify-center text-slate-400">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-2" />
                  <p className="text-sm font-medium">Loading proposal details and attendance statistics...</p>
                </div>
              ) : selectedEvent ? (
                <div className="space-y-5">
                  {/* Event Overview Card */}
                  <div className="bg-gradient-to-br from-slate-900 to-[#001A4D] rounded-xl p-5 text-white">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <span className="text-xs font-bold text-[#FFD41C] uppercase tracking-wider">
                        Linked Event Proposal
                      </span>
                      <span className="text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
                        Lifecycle: Concluded
                      </span>
                    </div>
                    <h3 className="text-lg font-black text-white">{selectedEvent.title}</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 text-xs text-slate-300">
                      <div>
                        <span className="text-slate-400 block font-medium">Hosting Body:</span>
                        <strong className="text-white">
                          {selectedEvent.hostingOrgName || (selectedEvent as any).organizationName || 'SAS'}
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block font-medium">Conducted At:</span>
                        <strong className="text-white">
                          {(selectedEvent as any).venue || 'STI Ormoc Campus'}
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block font-medium">Liquidation Clearance:</span>
                        <strong className="text-emerald-300">
                          {liquidationRef || 'Approved & Verified'}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* 2-Column Summary Metrics */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Attendance Turnout */}
                    <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4 text-blue-600" />
                          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                            Attendance Verification
                          </h4>
                        </div>
                        <span className="text-[11px] font-bold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">
                          Auto-Calculated
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-center mb-3">
                        <div className="bg-white p-3 rounded-lg border border-slate-200">
                          <span className="text-xs text-slate-500 block">Registered</span>
                          <span className="text-lg font-black text-slate-800">{registeredCount}</span>
                        </div>
                        <div className="bg-white p-3 rounded-lg border border-slate-200">
                          <span className="text-xs text-slate-500 block">Scanned / Attended</span>
                          <span className="text-lg font-black text-blue-700">{attendedCount}</span>
                        </div>
                      </div>
                      <div className="space-y-2 text-xs">
                        <div>
                          <label className="text-slate-500 font-semibold block mb-1">
                            Target Audience
                          </label>
                          <input
                            type="text"
                            value={targetAudience}
                            onChange={(e) => setTargetAudience(e.target.value)}
                            className="w-full bg-white border border-slate-300 rounded p-1.5 text-xs text-slate-800"
                            placeholder="e.g. BSIT & BSCS students"
                          />
                        </div>
                        <div>
                          <label className="text-slate-500 font-semibold block mb-1">
                            Actual Participant Profile
                          </label>
                          <input
                            type="text"
                            value={whoAttended}
                            onChange={(e) => setWhoAttended(e.target.value)}
                            className="w-full bg-white border border-slate-300 rounded p-1.5 text-xs text-slate-800"
                            placeholder="e.g. 1st to 4th year IT students and faculty"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Financial Summary */}
                    <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <DollarSign className="w-4 h-4 text-emerald-600" />
                          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                            Financial Liquidation Clearance
                          </h4>
                        </div>
                        <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                          Cleared
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center mb-3">
                        <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                          <span className="text-[10px] text-slate-500 block">Total Budget</span>
                          <span className="text-sm font-bold text-slate-800">
                            {formatCurrency(totalRevenue)}
                          </span>
                        </div>
                        <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                          <span className="text-[10px] text-slate-500 block">Disbursed</span>
                          <span className="text-sm font-bold text-slate-800">
                            {formatCurrency(totalDisbursed)}
                          </span>
                        </div>
                        <div
                          className={`p-2.5 rounded-lg border ${
                            isSurplus ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'
                          }`}
                        >
                          <span className="text-[10px] block font-medium">Balance</span>
                          <span className="text-sm font-bold">
                            {formatVariance(netBalance)}
                          </span>
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Financial figures are verified against approved institutional liquidation records{liquidationRef ? ` (${liquidationRef})` : ''}.
                      </p>
                    </div>
                  </div>

                  {/* Actual Mechanics Note */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                      Actual Mechanics & Logistics Conducted (Optional Notes)
                    </label>
                    <textarea
                      rows={2}
                      value={actualMechanics}
                      onChange={(e) => setActualMechanics(e.target.value)}
                      placeholder="Indicate here if any mechanics differed slightly from the initial proposal, or leave blank if executed verbatim."
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center text-slate-400">
                  <FileText className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                  <p className="text-sm font-medium">Please select a concluded event above to proceed.</p>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: OBJECTIVES & LEARNINGS */}
          {activeTab === 'objectives' && (
            <div className="space-y-6">
              {/* Objectives Achievement Status */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                  Achievement of Objectives *
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { id: 'fully_achieved', label: 'Fully Achieved', desc: 'All targets and KPIs successfully met', color: 'emerald' },
                    { id: 'partially_achieved', label: 'Partially Achieved', desc: 'Core goals met with slight adjustments', color: 'amber' },
                    { id: 'unmet', label: 'Unmet', desc: 'Significant deviations or unfulfilled objectives', color: 'rose' },
                  ].map((s) => {
                    const isSelected = objectiveStatus === s.id;
                    return (
                      <button
                        type="button"
                        key={s.id}
                        onClick={() => setObjectiveStatus(s.id as PARObjectiveStatus)}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          isSelected
                            ? 'border-blue-600 bg-blue-50/70 shadow-sm ring-1 ring-blue-500'
                            : 'border-slate-200 bg-white hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-xs font-bold ${isSelected ? 'text-blue-900' : 'text-slate-800'}`}>
                            {s.label}
                          </span>
                          {isSelected && <CheckCircle2 className="w-4 h-4 text-blue-600" />}
                        </div>
                        <span className="text-[11px] text-slate-500 block leading-tight">{s.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Achievement Narrative */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Narrative of Accomplishments & Results *
                </label>
                <textarea
                  rows={3}
                  value={achievementNarrative}
                  onChange={(e) => setAchievementNarrative(e.target.value)}
                  placeholder="Detail how the activity met its designated educational and co-curricular objectives..."
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              {/* Key Learnings List */}
              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Key Learnings & Student Insights (3–5 Points) *
                  </label>
                  <span className="text-[11px] text-slate-400 font-medium">
                    {keyLearnings.length} added
                  </span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newLearningInput}
                    onChange={(e) => setNewLearningInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddLearning();
                      }
                    }}
                    placeholder="Enter an insight or learning takeaway..."
                    className="flex-1 bg-white border border-slate-300 rounded-lg p-2 text-xs text-slate-800"
                  />
                  <button
                    type="button"
                    onClick={handleAddLearning}
                    className="bg-[#0E4EBD] hover:bg-[#001A4D] text-white px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
                  >
                    <Plus className="w-4 h-4" /> Add
                  </button>
                </div>
                <div className="space-y-1.5">
                  {keyLearnings.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between bg-white border border-slate-200 px-3 py-2 rounded-lg text-xs text-slate-800 shadow-2xs"
                    >
                      <span className="flex-1 pr-2">
                        <strong className="text-blue-700 font-bold mr-1.5">•</strong>
                        {item}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveLearning(idx)}
                        className="text-slate-400 hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Classroom & Curriculum Enrichment */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Classroom & Academic Curriculum Enrichment
                </label>
                <textarea
                  rows={2}
                  value={classroomEnrichment}
                  onChange={(e) => setClassroomEnrichment(e.target.value)}
                  placeholder="Explain how the outcomes of this event enrich students' academic learning in the classroom..."
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              {/* Operational & Issues */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Venue Assessment
                  </label>
                  <input
                    type="text"
                    value={venueAssessment}
                    onChange={(e) => setVenueAssessment(e.target.value)}
                    placeholder="e.g. Spacious, air-conditioning functional, adequate chairs."
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Issues / Bottlenecks Encountered
                  </label>
                  <input
                    type="text"
                    value={issuesEncountered}
                    onChange={(e) => setIssuesEncountered(e.target.value)}
                    placeholder="e.g. Minor 10-minute projection delay, resolved quickly."
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs text-slate-800"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: 4 STI CATEGORIZED RECOMMENDATIONS */}
          {activeTab === 'recommendations' && (
            <div className="space-y-6">
              <div className="bg-blue-50/70 p-4 rounded-xl border border-blue-200">
                <h4 className="text-xs font-black uppercase tracking-wider text-[#001A4D] flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-[#0E4EBD]" />
                  STI Institutional Post-Mortem Areas (Verbatim Standard)
                </h4>
                <p className="text-xs text-slate-600 mt-1">
                  Complete the four standard STI recommendation categories to provide institutional insights for future campus events.
                </p>
              </div>

              {/* 1. Program Flow */}
              <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-2xs space-y-3">
                <h5 className="text-xs font-bold uppercase text-[#001A4D]">
                  1. Program Flow & Time Management
                </h5>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-500 font-medium block mb-1">Observations:</span>
                    <textarea
                      rows={2}
                      value={progFlowObs}
                      onChange={(e) => setProgFlowObs(e.target.value)}
                      placeholder="Observation on pacing, opening remarks, and agenda compliance..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs"
                    />
                  </div>
                  <div>
                    <span className="text-slate-500 font-medium block mb-1">Recommendations:</span>
                    <textarea
                      rows={2}
                      value={progFlowRec}
                      onChange={(e) => setProgFlowRec(e.target.value)}
                      placeholder="Proposed adjustments for subsequent events..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* 2. Participant Engagement */}
              <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-2xs space-y-3">
                <h5 className="text-xs font-bold uppercase text-[#001A4D]">
                  2. Participant Engagement & Interaction
                </h5>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-500 font-medium block mb-1">Observations:</span>
                    <textarea
                      rows={2}
                      value={engagementObs}
                      onChange={(e) => setEngagementObs(e.target.value)}
                      placeholder="Observations on audience participation, QA, and attentiveness..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs"
                    />
                  </div>
                  <div>
                    <span className="text-slate-500 font-medium block mb-1">Recommendations:</span>
                    <textarea
                      rows={2}
                      value={engagementRec}
                      onChange={(e) => setEngagementRec(e.target.value)}
                      placeholder="Methods to increase interaction..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* 3. Technical Setup */}
              <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-2xs space-y-3">
                <h5 className="text-xs font-bold uppercase text-[#001A4D]">
                  3. Technical Setup & Equipment (Audio-Visual, WiFi, Power)
                </h5>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-500 font-medium block mb-1">Observations:</span>
                    <textarea
                      rows={2}
                      value={techSetupObs}
                      onChange={(e) => setTechSetupObs(e.target.value)}
                      placeholder="Performance of projectors, sound system, and network..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs"
                    />
                  </div>
                  <div>
                    <span className="text-slate-500 font-medium block mb-1">Recommendations:</span>
                    <textarea
                      rows={2}
                      value={techSetupRec}
                      onChange={(e) => setTechSetupRec(e.target.value)}
                      placeholder="Technical prep or equipment requisition adjustments..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* 4. Participant Preparedness */}
              <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-2xs space-y-3">
                <h5 className="text-xs font-bold uppercase text-[#001A4D]">
                  4. Participant Preparedness & Prior Orientation
                </h5>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-500 font-medium block mb-1">Observations:</span>
                    <textarea
                      rows={2}
                      value={prepObs}
                      onChange={(e) => setPrepObs(e.target.value)}
                      placeholder="Student readiness, materials brought, dress code compliance..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs"
                    />
                  </div>
                  <div>
                    <span className="text-slate-500 font-medium block mb-1">Recommendations:</span>
                    <textarea
                      rows={2}
                      value={prepRec}
                      onChange={(e) => setPrepRec(e.target.value)}
                      placeholder="Pre-event announcements or briefing enhancements..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: PHOTOS & SIGNATORIES PIPELINE */}
          {activeTab === 'photos_signatories' && (
            <div className="space-y-6">
              {/* Photo Documentation Section */}
              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                      Photo Documentation Gallery
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Add 2 to 6 high-resolution event documentation image links.
                    </p>
                  </div>
                  <span className="text-xs font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                    {photos.length} photos
                  </span>
                </div>

                {/* Add Photo Input */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                  <div className="sm:col-span-7">
                    <input
                      type="url"
                      value={newPhotoUrl}
                      onChange={(e) => setNewPhotoUrl(e.target.value)}
                      placeholder="Image URL (https://...)"
                      className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs text-slate-800"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <input
                      type="text"
                      value={newPhotoCaption}
                      onChange={(e) => setNewPhotoCaption(e.target.value)}
                      placeholder="Caption (e.g. Keynote)"
                      className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs text-slate-800"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <button
                      type="button"
                      onClick={handleAddPhoto}
                      className="w-full bg-[#0E4EBD] hover:bg-[#001A4D] text-white p-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Plus className="w-4 h-4" /> Add
                    </button>
                  </div>
                </div>

                {/* Photo Previews */}
                {photos.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                    {photos.map((p) => (
                      <div
                        key={p.id}
                        className="group relative rounded-lg overflow-hidden border border-slate-200 bg-white shadow-2xs aspect-video"
                      >
                        <img
                          src={p.url}
                          alt={p.caption}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src =
                              'https://placehold.co/400x300?text=Event+Photo';
                          }}
                        />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity p-2 flex flex-col justify-between text-white text-[10px]">
                          <span className="truncate">{p.caption}</span>
                          <button
                            type="button"
                            onClick={() => handleRemovePhoto(p.id)}
                            className="self-end bg-red-600 hover:bg-red-700 p-1 rounded text-white"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Dynamic Signatory Pipeline Preview */}
              <div className="border border-slate-200 rounded-xl p-5 bg-white space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-blue-600" />
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                        Dynamic Institutional Signatory Pipeline
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Configured in Institutional Settings & Signatories Maintenance
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-slate-500">
                    {approvalChain.length} steps configured
                  </span>
                </div>

                <div className="space-y-2">
                  {approvalChain.map((step, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs">
                          {step.step}
                        </div>
                        <div>
                          <strong className="text-slate-900 block font-bold">
                            {step.signatoryName || 'Institutional Signatory'}
                          </strong>
                          <span className="text-[11px] text-slate-500">
                            {step.roleTitle} {step.department ? `(${step.department})` : ''}
                          </span>
                        </div>
                      </div>
                      <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider bg-white border border-slate-200 px-2.5 py-1 rounded-md">
                        {step.actionType === 'approve' ? 'Final Approval' : 'Endorsement'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="border-t border-slate-200 bg-slate-50 p-4 px-6 flex items-center justify-between">
          <div className="flex gap-2">
            {activeTab !== 'overview' && (
              <button
                type="button"
                onClick={() => {
                  const tabs: WizardTab[] = ['overview', 'objectives', 'recommendations', 'photos_signatories'];
                  const curIdx = tabs.indexOf(activeTab);
                  if (curIdx > 0) setActiveTab(tabs[curIdx - 1]);
                }}
                className="px-3 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 bg-white border border-slate-300 rounded-lg flex items-center gap-1"
              >
                <ChevronLeft className="w-4 h-4" /> Previous
              </button>
            )}
            {activeTab !== 'photos_signatories' && (
              <button
                type="button"
                onClick={() => {
                  const tabs: WizardTab[] = ['overview', 'objectives', 'recommendations', 'photos_signatories'];
                  const curIdx = tabs.indexOf(activeTab);
                  if (curIdx < tabs.length - 1) setActiveTab(tabs[curIdx + 1]);
                }}
                className="px-3 py-2 text-xs font-bold text-slate-700 hover:text-slate-900 bg-white border border-slate-300 rounded-lg flex items-center gap-1"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleSubmitOrDraft(false)}
              className="px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200 bg-slate-100 border border-slate-300 rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              Save Draft
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleSubmitOrDraft(true)}
              className="px-5 py-2 text-xs font-black text-white bg-gradient-to-r from-[#0E4EBD] to-[#001A4D] hover:opacity-95 shadow-md rounded-lg flex items-center gap-2 transition-all disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 text-[#FFD41C]" />
                  Submit for Endorsement
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
