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
  RotateCcw,
  BookOpen,
  Target,
  Award,
  Check,
  Lock,
  Coins,
} from 'lucide-react';
import { toast } from 'sonner';
import DigitalSignatureModal from '../../../signatory/components/DigitalSignatureModal';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import { EVENTS_COLLECTION } from '../../events/services/event.service';
import { LIQUIDATIONS_COLLECTION } from '../../finance/services/liquidation.service';
import {
  saveOrSubmitPAR,
  generateDefaultPARSignatoryChain,
} from '../services/par.service';
import {
  resolveUserSignature,
  getFastCachedSignature,
  syncUserSignatureAcrossProfiles,
} from '../../signatories';
import { computeEventAttendanceSummary } from '../services/par-attendance-bridge.service';
import PARProposalGuidanceDrawer from './PARProposalGuidanceDrawer';
import type {
  PostActivityReportDocument,
  PARFormData,
  PARObjectiveStatus,
  PARPhotoAttachment,
  PARApprovalStep,
} from '../types/par.types';
import type { EventDocument } from '../../events/types/event.types';
import { isSasInstitutionalActivity } from '../../events/utils/event-lifecycle.utils';
import { formatCurrency, formatVariance } from '../../../utils/currency';
import RevisionFeedbackBanner from '../../workflow/components/RevisionFeedbackBanner';
import PARFlowBuilder from './PARFlowBuilder';
import { subscribeToSignatories } from '../../signatories/services/signatory.service';
import type { InstitutionalSignatory } from '../../signatories/types/signatory.types';
import {
  AIAssistButton,
  AISuggestionModal,
  enhancePARNarrative,
  suggestKeyLearnings,
  generatePARRecommendations,
  polishGrammar,
  generateText,
} from '../../ai';

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
    isAdviser?: boolean;
    organizationId?: string;
    organizationName?: string;
    signatureUrl?: string | null;
  };
  isSasAdmin?: boolean;
}

type WizardTab = 'overview' | 'objectives' | 'recommendations' | 'photos_signatories';

interface DynamicRemarkCategoryProps {
  number: string;
  title: string;
  obsList: string[];
  recList: string[];
  onUpdateObs: (idx: number, val: string) => void;
  onAddObs: () => void;
  onRemoveObs: (idx: number) => void;
  onUpdateRec: (idx: number, val: string) => void;
  onAddRec: () => void;
  onRemoveRec: (idx: number) => void;
  errorObs?: boolean;
  errorRec?: boolean;
}

function DynamicRemarkCategory({
  number,
  title,
  obsList,
  recList,
  onUpdateObs,
  onAddObs,
  onRemoveObs,
  onUpdateRec,
  onAddRec,
  onRemoveRec,
  errorObs,
  errorRec,
}: DynamicRemarkCategoryProps) {
  return (
    <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-2xs space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-slate-100 pb-2">
        <h5 className="text-xs font-black uppercase text-[#001A4D]">
          {number}. {title} *
        </h5>
        <span className="text-[11px] font-medium text-slate-500">
          {obsList.filter(Boolean).length} observation(s) • {recList.filter(Boolean).length} recommendation(s)
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Observations Column */}
        <div className={`p-3 rounded-xl border bg-slate-50/70 space-y-2.5 ${errorObs ? 'border-red-400 ring-1 ring-red-400' : 'border-slate-200'}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">Observations:</span>
            <button
              type="button"
              onClick={onAddObs}
              className="text-[11px] font-bold text-blue-700 hover:text-blue-900 flex items-center gap-1 cursor-pointer bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded-md transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add Observation
            </button>
          </div>

          <div className="space-y-2">
            {obsList.map((obs, idx) => (
              <div key={idx} className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-slate-400 shrink-0">•</span>
                <input
                  type="text"
                  value={obs}
                  onChange={(e) => onUpdateObs(idx, e.target.value)}
                  placeholder={`Observation #${idx + 1}...`}
                  className="flex-1 text-xs bg-white border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => onRemoveObs(idx)}
                  disabled={obsList.length <= 1}
                  className="p-1.5 text-slate-400 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  title="Remove observation"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Recommendations Column */}
        <div className={`p-3 rounded-xl border bg-slate-50/70 space-y-2.5 ${errorRec ? 'border-red-400 ring-1 ring-red-400' : 'border-slate-200'}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">Recommendations:</span>
            <button
              type="button"
              onClick={onAddRec}
              className="text-[11px] font-bold text-blue-700 hover:text-blue-900 flex items-center gap-1 cursor-pointer bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded-md transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add Recommendation
            </button>
          </div>

          <div className="space-y-2">
            {recList.map((rec, idx) => (
              <div key={idx} className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-slate-400 shrink-0">•</span>
                <input
                  type="text"
                  value={rec}
                  onChange={(e) => onUpdateRec(idx, e.target.value)}
                  placeholder={`Recommendation #${idx + 1}...`}
                  className="flex-1 text-xs bg-white border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => onRemoveRec(idx)}
                  disabled={recList.length <= 1}
                  className="p-1.5 text-slate-400 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  title="Remove recommendation"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

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
  const [resubmissionNote, setResubmissionNote] = useState('');
  const [makerSignatureUrl, setMakerSignatureUrl] = useState<string | null>(() => {
    return getFastCachedSignature(currentUser) || null;
  });
  const [isSignatureModalOpen, setIsSignatureModalOpen] = useState(false);

  // Sync maker signature from all profile sources if not directly passed
  useEffect(() => {
    let isCancelled = false;
    const fastSig = getFastCachedSignature(currentUser);
    if (fastSig && !makerSignatureUrl) {
      setMakerSignatureUrl(fastSig);
    }

    resolveUserSignature({
      uid: currentUser?.uid,
      email: currentUser?.email,
      role: currentUser?.role,
      profile: currentUser,
    }).then((sig) => {
      if (!isCancelled && sig) {
        setMakerSignatureUrl(sig);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [currentUser?.uid, currentUser?.email, currentUser?.role, (currentUser as any)?.signatureUrl]);

  const isReturnedReport = Boolean(
    initialReport?.status === 'returned' ||
    (initialReport as any)?.isReturned
  );

  const isAdviserOrAdmin = Boolean(
    isSasAdmin ||
    currentUser.role === 'admin' ||
    currentUser.role === 'sas_admin' ||
    currentUser.role === 'adviser' ||
    (currentUser as any).isAdviser
  );

  const isOverviewFlagged = Boolean(
    initialReport?.returnFlags?.includes('overview') ||
    initialReport?.stepRevisionRemarks?.['overview']
  );
  const isObjectivesFlagged = Boolean(
    initialReport?.returnFlags?.includes('objectives') ||
    initialReport?.stepRevisionRemarks?.['objectives']
  );
  const isRecommendationsFlagged = Boolean(
    initialReport?.returnFlags?.includes('recommendations') ||
    initialReport?.stepRevisionRemarks?.['recommendations']
  );
  const isPhotosSignatoriesFlagged = Boolean(
    initialReport?.returnFlags?.includes('photos_signatories') ||
    initialReport?.stepRevisionRemarks?.['photos_signatories']
  );

  // Form State
  const [selectedEventId, setSelectedEventId] = useState<string>(
    initialReport?.eventId || initialEventId || ''
  );
  const [selectedEvent, setSelectedEvent] = useState<EventDocument | null>(null);

  // Section 1: Summary & Mechanics
  const [actualMechanics, setActualMechanics] = useState('');
  const [registeredCount, setRegisteredCount] = useState(0);
  const [attendedCount, setAttendedCount] = useState(0);
  const [turnoutRate, setTurnoutRate] = useState<number>(0);
  const [targetAudience, setTargetAudience] = useState('');
  const [whoAttended, setWhoAttended] = useState('');
  const [howManyAttended, setHowManyAttended] = useState('');
  const [linkedProposal, setLinkedProposal] = useState<any>(null);
  const [isGuidanceDrawerOpen, setIsGuidanceDrawerOpen] = useState(false);
  const [objectiveAssessments, setObjectiveAssessments] = useState<
    Array<{
      id: string;
      objectiveText: string;
      successIndicatorText?: string;
      status: 'fully_achieved' | 'partially_achieved' | 'unmet';
      actualResult: string;
      varianceRemarks?: string;
    }>
  >([]);

  // Proposal Copied Fields
  const [proposalOrganizers, setProposalOrganizers] = useState<string[]>([]);
  const [proposedMechanics, setProposedMechanics] = useState<string[]>([]);
  const [proposalMaterials, setProposalMaterials] = useState<string[]>([]);
  const [proposalMarketingPlan, setProposalMarketingPlan] = useState<string[]>([]);
  const [proposalDocumentationPlan, setProposalDocumentationPlan] = useState<string[]>([]);
  const [proposalObjectives, setProposalObjectives] = useState<string[]>([]);
  const [proposalSuccessIndicators, setProposalSuccessIndicators] = useState<string[]>([]);

  // Section 2: Financial
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalDisbursed, setTotalDisbursed] = useState(0);
  const [liquidationRef, setLiquidationRef] = useState('');
  const [financialLineItems, setFinancialLineItems] = useState<
    Array<{ description: string; unitAmount: number; totalAmount: number }>
  >([]);

  // Section 3: Objectives & Results
  const [objectiveStatus, setObjectiveStatus] = useState<PARObjectiveStatus>('fully_achieved');
  const compositeScore = useMemo(() => {
    if (objectiveAssessments.length === 0) {
      if (objectiveStatus === 'fully_achieved') return Math.max(90, turnoutRate || 90);
      if (objectiveStatus === 'partially_achieved') return 75;
      return 50;
    }
    const total = objectiveAssessments.length;
    let points = 0;
    objectiveAssessments.forEach((o) => {
      if (o.status === 'fully_achieved') points += 1.0;
      else if (o.status === 'partially_achieved') points += 0.5;
    });
    const objPct = (points / total) * 100;
    const attRate = turnoutRate || 100;
    // 40% attendance turnout, 60% objective fulfillment
    return Math.min(100, Math.round(0.4 * attRate + 0.6 * objPct));
  }, [objectiveAssessments, objectiveStatus, turnoutRate]);
  const [achievementNarrative, setAchievementNarrative] = useState('');
  const [keyLearnings, setKeyLearnings] = useState<string[]>([]);
  const [newLearningInput, setNewLearningInput] = useState('');
  const [classroomEnrichment, setClassroomEnrichment] = useState('');
  const [venueAssessment, setVenueAssessment] = useState('');
  const [foodAssessment, setFoodAssessment] = useState('');
  const [logisticsAssessment, setLogisticsAssessment] = useState('');
  const [scheduleCompliance, setScheduleCompliance] = useState('');
  const [issuesEncountered, setIssuesEncountered] = useState('');

  // Step 3: Remarks (Dynamic Observation and Recommendation Lists)
  const [progFlowObsList, setProgFlowObsList] = useState<string[]>(['']);
  const [progFlowRecList, setProgFlowRecList] = useState<string[]>(['']);
  const [engagementObsList, setEngagementObsList] = useState<string[]>(['']);
  const [engagementRecList, setEngagementRecList] = useState<string[]>(['']);
  const [techSetupObsList, setTechSetupObsList] = useState<string[]>(['']);
  const [techSetupRecList, setTechSetupRecList] = useState<string[]>(['']);
  const [prepObsList, setPrepObsList] = useState<string[]>(['']);
  const [prepRecList, setPrepRecList] = useState<string[]>(['']);

  const handleUpdateRemarkItem = (
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    index: number,
    value: string
  ) => {
    setter((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const handleAddRemarkItem = (setter: React.Dispatch<React.SetStateAction<string[]>>) => {
    setter((prev) => [...prev, '']);
  };

  const handleRemoveRemarkItem = (
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    index: number
  ) => {
    setter((prev) => {
      if (prev.length <= 1) return [''];
      return prev.filter((_, i) => i !== index);
    });
  };

  const parseRemarkList = (raw: any): string[] => {
    if (Array.isArray(raw) && raw.length > 0) return raw.map((s) => String(s).replace(/^[•\-\*]\s*/, '').trim()).filter(Boolean);
    if (typeof raw === 'string' && raw.trim()) {
      const lines = raw.split('\n').map((s) => s.replace(/^[•\-\*]\s*/, '').trim()).filter(Boolean);
      if (lines.length > 0) return lines;
    }
    return [''];
  };

  // Section 5: Photos & Pipeline
  const [photos, setPhotos] = useState<PARPhotoAttachment[]>([]);
  const [approvalChain, setApprovalChain] = useState<PARApprovalStep[]>([]);
  const [activeSignatories, setActiveSignatories] = useState<InstitutionalSignatory[]>([]);

  // Attendance & Validation Engine States
  const [hasScannedAttendance, setHasScannedAttendance] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, boolean>>({});

  const handleRegisteredCountChange = (val: number) => {
    const reg = Math.max(0, val);
    setRegisteredCount(reg);
    const rate = reg > 0 ? Math.min(100, Math.round((attendedCount / reg) * 100)) : (attendedCount > 0 ? 100 : 0);
    setTurnoutRate(rate);
    setHowManyAttended(`${attendedCount} / ${reg} Attendees (${rate}% Turnout)`);
    if (validationErrors.registeredCount && reg > 0) {
      setValidationErrors((prev) => ({ ...prev, registeredCount: false }));
    }
  };

  const handleAttendedCountChange = (val: number) => {
    const att = Math.max(0, val);
    setAttendedCount(att);
    const rate = registeredCount > 0 ? Math.min(100, Math.round((att / registeredCount) * 100)) : (att > 0 ? 100 : 0);
    setTurnoutRate(rate);
    setHowManyAttended(`${att} / ${registeredCount || att} Attendees (${rate}% Turnout)`);
    if (validationErrors.attendedCount && att > 0) {
      setValidationErrors((prev) => ({ ...prev, attendedCount: false }));
    }
  };

  // AI Assistant State
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiModalTitle, setAiModalTitle] = useState('');
  const [aiModalDesc, setAiModalDesc] = useState('');
  const [aiOriginalText, setAiOriginalText] = useState('');
  const [aiSuggestionText, setAiSuggestionText] = useState('');
  const [aiSuggestionList, setAiSuggestionList] = useState<string[]>([]);
  const [aiModalMode, setAiModalMode] = useState<'text' | 'choice' | 'list'>('text');
  const [isAILoading, setIsAILoading] = useState(false);
  const [isGeneratingRecs, setIsGeneratingRecs] = useState(false);
  const [aiTargetField, setAiTargetField] = useState<'mechanics' | 'narrative' | 'learnings' | 'enrichment'>('narrative');
  const [activeAIAction, setActiveAIAction] = useState<(() => Promise<void>) | null>(null);

  const handleEnhanceActualMechanics = async () => {
    const raw = actualMechanics.trim();
    if (!raw) {
      toast.info('Please enter some brief notes about how the mechanics were conducted first.');
      return;
    }
    const action = async () => {
      setIsAILoading(true);
      const polished = await polishGrammar(raw, 'Actual Event Mechanics (Conducted)');
      setIsAILoading(false);
      if (polished) {
        setAiTargetField('mechanics');
        setAiModalTitle('Enhance Actual Mechanics');
        setAiModalDesc('Polished narrative of actual procedures conducted during the event:');
        setAiOriginalText(raw);
        setAiSuggestionText(polished);
        setAiModalMode('text');
        setAiModalOpen(true);
      }
    };
    setActiveAIAction(() => action);
    await action();
  };

  const handleEnhanceCurriculumEnrichment = async () => {
    const eventTitle = selectedEvent?.title || 'Campus Event';
    const action = async () => {
      setIsAILoading(true);
      const prompt = `
Event Title: "${eventTitle}"
Conducted Mechanics: "${actualMechanics || ''}"
Key Learnings: "${keyLearnings.join('; ') || ''}"
Current Draft: "${classroomEnrichment || ''}"

Explain how the outcomes of this event enrich students' academic learning in the classroom and reinforce STI graduate attributes.
Write 1 clear, formal academic paragraph of 40-70 words.
Output ONLY the paragraph text.
`;
      const enriched = await generateText(prompt);
      setIsAILoading(false);
      if (enriched) {
        setAiTargetField('enrichment');
        setAiModalTitle('Classroom Curriculum Enrichment');
        setAiModalDesc('Institutional statement linking practical event experiences to curriculum competencies:');
        setAiOriginalText(classroomEnrichment);
        setAiSuggestionText(enriched);
        setAiModalMode('text');
        setAiModalOpen(true);
      }
    };
    setActiveAIAction(() => action);
    await action();
  };

  const handleEnhanceNarrative = async () => {
    const eventTitle = selectedEvent?.title || 'Campus Event';
    const action = async () => {
      setIsAILoading(true);
      const narrative = await enhancePARNarrative(eventTitle, achievementNarrative, registeredCount, attendedCount);
      setIsAILoading(false);
      if (narrative) {
        setAiTargetField('narrative');
        setAiModalTitle('Achievement Narrative');
        setAiModalDesc('Comprehensive accomplishments statement based on turnout and results:');
        setAiOriginalText(achievementNarrative);
        setAiSuggestionText(narrative);
        setAiModalMode('text');
        setAiModalOpen(true);
      }
    };
    setActiveAIAction(() => action);
    await action();
  };

  const handleSuggestKeyLearningsAction = async () => {
    const eventTitle = selectedEvent?.title || 'Campus Event';
    const action = async () => {
      setIsAILoading(true);
      const learnings = await suggestKeyLearnings(eventTitle, actualMechanics || achievementNarrative);
      setIsAILoading(false);
      if (learnings && learnings.length > 0) {
        setAiTargetField('learnings');
        setAiModalTitle('Suggested Key Learnings');
        setAiModalDesc('Select learning takeaways to include in your Post-Activity Report:');
        setAiSuggestionList(learnings);
        setAiModalMode('list');
        setAiModalOpen(true);
      }
    };
    setActiveAIAction(() => action);
    await action();
  };

  const handleAutoDraft4Recommendations = async () => {
    if (!selectedEvent) {
      toast.info('Please select an event in Overview first.');
      return;
    }
    setIsGeneratingRecs(true);
    const recs = await generatePARRecommendations(selectedEvent.title, issuesEncountered, achievementNarrative);
    setIsGeneratingRecs(false);
    if (recs) {
      if (recs.programFlow) {
        setProgFlowObsList(parseRemarkList(recs.programFlow.observations));
        setProgFlowRecList(parseRemarkList(recs.programFlow.recommendations));
      }
      if (recs.participantEngagement) {
        setEngagementObsList(parseRemarkList(recs.participantEngagement.observations));
        setEngagementRecList(parseRemarkList(recs.participantEngagement.recommendations));
      }
      if (recs.technicalSetup) {
        setTechSetupObsList(parseRemarkList(recs.technicalSetup.observations));
        setTechSetupRecList(parseRemarkList(recs.technicalSetup.recommendations));
      }
      if (recs.participantPreparedness) {
        setPrepObsList(parseRemarkList(recs.participantPreparedness.observations));
        setPrepRecList(parseRemarkList(recs.participantPreparedness.recommendations));
      }
      toast.success('Successfully drafted Remarks observations & recommendations!');
    }
  };

  const handleApplyAIText = (appliedText: string, applyMode: 'replace' | 'append') => {
    if (aiTargetField === 'mechanics') {
      setActualMechanics(applyMode === 'append' && actualMechanics ? `${actualMechanics}\n\n${appliedText}` : appliedText);
      toast.success('Actual mechanics updated!');
    } else if (aiTargetField === 'narrative') {
      setAchievementNarrative(applyMode === 'append' && achievementNarrative ? `${achievementNarrative}\n\n${appliedText}` : appliedText);
      toast.success('Achievement narrative updated!');
    } else if (aiTargetField === 'enrichment') {
      setClassroomEnrichment(applyMode === 'append' && classroomEnrichment ? `${classroomEnrichment}\n\n${appliedText}` : appliedText);
      toast.success('Curriculum enrichment updated!');
    }
  };

  const handleApplyAIList = (items: string[]) => {
    if (aiTargetField === 'learnings') {
      setKeyLearnings([...keyLearnings, ...items]);
      toast.success(`Added ${items.length} learning item(s)!`);
    }
  };

  // Subscribe to real-time institutional signatories
  useEffect(() => {
    const unsub = subscribeToSignatories((list) => {
      setActiveSignatories(list);
    });
    return () => unsub();
  }, []);

  // Initialize from editing document if provided
  useEffect(() => {
    if (initialReport) {
      setSelectedEventId(initialReport.eventId);
      setActualMechanics(initialReport.actualMechanics || '');
      setRegisteredCount(initialReport.attendanceSummary?.registeredCount || 0);
      setAttendedCount(initialReport.attendanceSummary?.attendedCount || 0);
      setTargetAudience(initialReport.attendanceSummary?.targetAudience || '');
      setWhoAttended(initialReport.attendanceSummary?.whoAttended || '');
      setHasScannedAttendance((initialReport.attendanceSummary?.attendedCount || 0) > 0);
      setHowManyAttended(
        initialReport.attendanceSummary?.howManyAttended ||
          (initialReport.attendanceSummary?.attendedCount
            ? `${initialReport.attendanceSummary.attendedCount} Attendees`
            : '')
      );

      // Hydrate proposal fields
      setProposalOrganizers(initialReport.proposalOrganizers || []);
      setProposedMechanics(initialReport.proposedMechanics || []);
      setProposalMaterials(initialReport.proposalMaterials || []);
      setProposalMarketingPlan(initialReport.proposalMarketingPlan || []);
      setProposalDocumentationPlan(initialReport.proposalDocumentationPlan || []);
      setProposalObjectives(initialReport.proposalObjectives || []);
      setProposalSuccessIndicators(initialReport.proposalSuccessIndicators || []);

      setTotalRevenue(initialReport.financialSummary?.totalRevenue || 0);
      setTotalDisbursed(initialReport.financialSummary?.totalDisbursed || 0);
      setLiquidationRef(initialReport.liquidationRefNumber || '');
      setFinancialLineItems(initialReport.financialSummary?.lineItems || []);

      setObjectiveStatus(initialReport.results?.objectiveStatus || 'fully_achieved');
      setAchievementNarrative(initialReport.results?.achievementNarrative || '');
      setKeyLearnings(initialReport.results?.keyLearnings || []);
      setClassroomEnrichment(initialReport.results?.classroomEnrichment || '');
      setVenueAssessment(initialReport.results?.venueAssessment || '');
      setFoodAssessment(initialReport.results?.foodAssessment || '');
      setLogisticsAssessment(initialReport.results?.logisticsAssessment || '');
      setScheduleCompliance(initialReport.results?.scheduleCompliance || '');
      setIssuesEncountered(initialReport.results?.issuesEncountered || '');

      setProgFlowObsList(parseRemarkList((initialReport.recommendations?.programFlow as any)?.observationsList || initialReport.recommendations?.programFlow?.observations));
      setProgFlowRecList(parseRemarkList((initialReport.recommendations?.programFlow as any)?.recommendationsList || initialReport.recommendations?.programFlow?.recommendations));
      setEngagementObsList(parseRemarkList((initialReport.recommendations?.participantEngagement as any)?.observationsList || initialReport.recommendations?.participantEngagement?.observations));
      setEngagementRecList(parseRemarkList((initialReport.recommendations?.participantEngagement as any)?.recommendationsList || initialReport.recommendations?.participantEngagement?.recommendations));
      setTechSetupObsList(parseRemarkList((initialReport.recommendations?.technicalSetup as any)?.observationsList || initialReport.recommendations?.technicalSetup?.observations));
      setTechSetupRecList(parseRemarkList((initialReport.recommendations?.technicalSetup as any)?.recommendationsList || initialReport.recommendations?.technicalSetup?.recommendations));
      setPrepObsList(parseRemarkList((initialReport.recommendations?.participantPreparedness as any)?.observationsList || initialReport.recommendations?.participantPreparedness?.observations));
      setPrepRecList(parseRemarkList((initialReport.recommendations?.participantPreparedness as any)?.recommendationsList || initialReport.recommendations?.participantPreparedness?.recommendations));

      setPhotos(initialReport.photos || []);
      setApprovalChain(initialReport.approvalChain || []);

      if (initialReport.attendanceSummary?.turnoutRate !== undefined) {
        setTurnoutRate(initialReport.attendanceSummary.turnoutRate);
      }
      if (initialReport.results?.objectiveAssessments && initialReport.results.objectiveAssessments.length > 0) {
        setObjectiveAssessments(initialReport.results.objectiveAssessments);
      }
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

        // Fetch linked Activity Proposal (Form AP-01) for 100% full auto-population
        let proposalDoc: any = null;
        const proposalId = (evData as any).proposalId || (evData as any).activityProposalId;
        if (proposalId) {
          try {
            const pSnap = await getDoc(doc(db, 'activity_proposals', proposalId));
            if (pSnap.exists()) {
              proposalDoc = { id: pSnap.id, ...pSnap.data() };
            }
          } catch (pErr) {
            console.warn('[PostActivityReportWizardModal] Proposal fetch by ID notice:', pErr);
          }
        }
        if (!proposalDoc && evData.referenceId) {
          try {
            const pQuery = await getDocs(
              query(collection(db, 'activity_proposals'), where('referenceNo', '==', evData.referenceId))
            );
            if (!pQuery.empty) {
              proposalDoc = { id: pQuery.docs[0].id, ...pQuery.docs[0].data() };
            }
          } catch {}
        }
        setLinkedProposal(proposalDoc);

        // Auto-extract proposal fields
        const orgs =
          Array.isArray(proposalDoc?.organizers) && proposalDoc.organizers.length > 0
            ? proposalDoc.organizers
            : Array.isArray((evData as any).organizers) && (evData as any).organizers.length > 0
            ? (evData as any).organizers
            : [(evData as any).organizerName || evData.hostingOrgName || 'Student Affairs Services'];
        setProposalOrganizers(orgs);

        const mechs =
          Array.isArray(proposalDoc?.mechanics) && proposalDoc.mechanics.length > 0
            ? proposalDoc.mechanics
            : Array.isArray((evData as any).mechanics)
            ? (evData as any).mechanics
            : [];
        setProposedMechanics(mechs);

        const mats =
          Array.isArray(proposalDoc?.materials) && proposalDoc.materials.length > 0
            ? proposalDoc.materials
            : Array.isArray((evData as any).materials)
            ? (evData as any).materials
            : [];
        setProposalMaterials(mats);

        const mkt =
          Array.isArray(proposalDoc?.marketingPlan) && proposalDoc.marketingPlan.length > 0
            ? proposalDoc.marketingPlan
            : Array.isArray((evData as any).marketingPlan)
            ? (evData as any).marketingPlan
            : [];
        setProposalMarketingPlan(mkt);

        const docs =
          Array.isArray(proposalDoc?.documentationPlan) && proposalDoc.documentationPlan.length > 0
            ? proposalDoc.documentationPlan
            : Array.isArray((evData as any).documentationPlan)
            ? (evData as any).documentationPlan
            : [];
        setProposalDocumentationPlan(docs);

        const objs =
          Array.isArray(proposalDoc?.objectives) && proposalDoc.objectives.length > 0
            ? proposalDoc.objectives
            : Array.isArray((evData as any).objectives)
            ? (evData as any).objectives
            : [];
        setProposalObjectives(objs);

        const ind =
          Array.isArray(proposalDoc?.successIndicators) && proposalDoc.successIndicators.length > 0
            ? proposalDoc.successIndicators
            : Array.isArray((evData as any).successIndicators)
            ? (evData as any).successIndicators
            : [];
        setProposalSuccessIndicators(ind);

        // Initialize structured Objective & KPI Assessment items
        if (objs.length > 0) {
          setObjectiveAssessments((prev) => {
            if (prev.length > 0) return prev;
            return objs.map((objText: string, idx: number) => ({
              id: `obj-kpi-${idx}`,
              objectiveText: objText,
              successIndicatorText: ind[idx] || '',
              status: 'fully_achieved' as const,
              actualResult: '',
              varianceRemarks: '',
            }));
          });
        }

        // Bridge real-time attendance logs (eliminates static 50 fallback)
        try {
          const attResult = await computeEventAttendanceSummary(selectedEventId, evData, proposalDoc);
          setAttendedCount(attResult.attendedCount);
          setRegisteredCount(attResult.registeredCount);
          setTurnoutRate(attResult.turnoutRate);
          setHowManyAttended(attResult.howManyAttended);
          setWhoAttended(attResult.whoAttended || '');
          setTargetAudience(attResult.targetAudience || '');
          setHasScannedAttendance(attResult.attendedCount > 0);
        } catch (attErr) {
          console.warn('[PostActivityReportWizardModal] Attendance bridge fallback:', attErr);
          setAttendedCount(0);
          setRegisteredCount(0);
          setTurnoutRate(0);
          setHowManyAttended('');
          setWhoAttended('');
          setTargetAudience('');
          setHasScannedAttendance(false);
        }

        if (mechs.length > 0) {
          setActualMechanics((prev) => prev || mechs.join('\n'));
        }

        // Auto-populate Financial Projection directly from Form AP-01 (Approved Proposal)
        const pItems =
          Array.isArray(proposalDoc?.lineItems) && proposalDoc.lineItems.length > 0
            ? proposalDoc.lineItems
            : Array.isArray((evData as any).lineItems)
            ? (evData as any).lineItems
            : [];

        const rev = Number(
          proposalDoc?.allocatedBudget ??
            proposalDoc?.totalProposedBudget ??
            proposalDoc?.totalBudget ??
            evData.budget ??
            0
        );
        const exp = Number(
          proposalDoc?.totalExpenseAmount ??
            proposalDoc?.totalBudget ??
            evData.budget ??
            0
        );

        setTotalRevenue(rev);
        setTotalDisbursed(exp);
        setFinancialLineItems(
          pItems.map((li: any) => ({
            description: li.particulars || li.description || li.item || 'Projected Item',
            unitAmount: Number(li.unitCost || li.unitPrice || li.unitAmount || 0),
            totalAmount: Number(
              li.totalCost ||
                li.total ||
                li.totalAmount ||
                Number(li.quantity || 1) * Number(li.unitCost || li.unitPrice || 0) ||
                0
            ),
          }))
        );
        setLiquidationRef(proposalDoc?.referenceNo || evData.referenceId || 'AP-PROJECTION');

        // Auto-populate dynamic signatory pipeline if not initialized
        if (approvalChain.length === 0) {
          const isSasEvent = isSasAdmin || isSasInstitutionalActivity(evData);
          const chain = await generateDefaultPARSignatoryChain(evData.hostingOrgId, activeSignatories, isSasEvent);
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

  const handleMultipleFilesUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    let loadedCount = 0;
    const filesToProcess = Array.from(files);
    const newAttachments: PARPhotoAttachment[] = [];

    filesToProcess.forEach((file, index) => {
      if (!file.type.startsWith('image/')) {
        toast.error(`"${file.name}" is not an image file.`);
        loadedCount++;
        return;
      }
      if (file.size > 8 * 1024 * 1024) {
        toast.error(`"${file.name}" exceeds the 8MB size limit.`);
        loadedCount++;
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const base64Url = event.target?.result as string;
        if (base64Url) {
          newAttachments.push({
            id: `photo-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 7)}`,
            url: base64Url,
            caption: file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '),
            uploadedAt: new Date().toISOString(),
          });
        }
        loadedCount++;
        if (loadedCount === filesToProcess.length) {
          if (newAttachments.length > 0) {
            setPhotos((prev) => [...prev, ...newAttachments]);
            toast.success(`Attached ${newAttachments.length} event photo(s)!`);
            if (validationErrors.photos) {
              setValidationErrors((prev) => ({ ...prev, photos: false }));
            }
          }
        }
      };
      reader.onerror = () => {
        loadedCount++;
        toast.error(`Failed to read "${file.name}".`);
      };
      reader.readAsDataURL(file);
    });

    e.target.value = '';
  };

  const handleRemovePhoto = (id: string) => {
    setPhotos(photos.filter((p) => p.id !== id));
  };

  const validateFormForSubmission = (): boolean => {
    const errors: Record<string, boolean> = {};

    // Tab 1: Overview & Clearance
    if (!selectedEventId) {
      errors.selectedEventId = true;
      setValidationErrors(errors);
      setActiveTab('overview');
      toast.error('Please select a concluded event.');
      return false;
    }
    if (!registeredCount || registeredCount <= 0 || isNaN(registeredCount)) {
      errors.registeredCount = true;
      setValidationErrors(errors);
      setActiveTab('overview');
      toast.error('Please provide a valid Registered / Target participant headcount (greater than 0).');
      return false;
    }
    if (!attendedCount || attendedCount <= 0 || isNaN(attendedCount)) {
      errors.attendedCount = true;
      setValidationErrors(errors);
      setActiveTab('overview');
      toast.error('Please provide a valid Actual Attended participant headcount (greater than 0).');
      return false;
    }
    if (!whoAttended.trim()) {
      errors.whoAttended = true;
      setValidationErrors(errors);
      setActiveTab('overview');
      toast.error('Please specify the Actual Participant Profile (Who Attended).');
      return false;
    }

    // Tab 2: Results of the Activity
    if (!achievementNarrative.trim()) {
      errors.achievementNarrative = true;
      setValidationErrors(errors);
      setActiveTab('objectives');
      toast.error('Please provide 1. Achievement of Objectives narrative.');
      return false;
    }
    if (keyLearnings.filter(Boolean).length === 0) {
      errors.keyLearnings = true;
      setValidationErrors(errors);
      setActiveTab('objectives');
      toast.error('Please provide at least 1 key learning for 2. Key Learnings / Insights Gained.');
      return false;
    }

    // Tab 3: Remarks
    const hasProgFlowObs = progFlowObsList.some((s) => s.trim().length > 0);
    const hasProgFlowRec = progFlowRecList.some((s) => s.trim().length > 0);
    if (!hasProgFlowObs || !hasProgFlowRec) {
      errors.progFlow = true;
      setValidationErrors(errors);
      setActiveTab('recommendations');
      toast.error('Please provide both Observations and Recommendations for 1. Program Flow and Time Management.');
      return false;
    }

    const hasEngagementObs = engagementObsList.some((s) => s.trim().length > 0);
    const hasEngagementRec = engagementRecList.some((s) => s.trim().length > 0);
    if (!hasEngagementObs || !hasEngagementRec) {
      errors.engagement = true;
      setValidationErrors(errors);
      setActiveTab('recommendations');
      toast.error('Please provide both Observations and Recommendations for 2. Participant Engagement and Interaction.');
      return false;
    }

    const hasTechSetupObs = techSetupObsList.some((s) => s.trim().length > 0);
    const hasTechSetupRec = techSetupRecList.some((s) => s.trim().length > 0);
    if (!hasTechSetupObs || !hasTechSetupRec) {
      errors.techSetup = true;
      setValidationErrors(errors);
      setActiveTab('recommendations');
      toast.error('Please provide both Observations and Recommendations for 3. Technical Setup and Venue Preparation.');
      return false;
    }

    const hasPrepObs = prepObsList.some((s) => s.trim().length > 0);
    const hasPrepRec = prepRecList.some((s) => s.trim().length > 0);
    if (!hasPrepObs || !hasPrepRec) {
      errors.prep = true;
      setValidationErrors(errors);
      setActiveTab('recommendations');
      toast.error('Please provide both Observations and Recommendations for 4. Participant Preparedness and Expectations.');
      return false;
    }

    // Tab 4: Photos & Pipeline
    if (photos.length === 0) {
      errors.photos = true;
      setValidationErrors(errors);
      setActiveTab('photos_signatories');
      toast.error('Photo Documentation: Please attach at least 1 event documentation photo.');
      return false;
    }
    const isOrgFunds = (selectedEvent as any)?.fundingSource === 'organization_funds';
    if (!isOrgFunds && (!approvalChain || approvalChain.length === 0)) {
      setValidationErrors(errors);
      setActiveTab('photos_signatories');
      toast.error('Please ensure the institutional signatory pipeline is configured.');
      return false;
    }
    if (isReturnedReport && !resubmissionNote.trim()) {
      errors.resubmissionNote = true;
      setValidationErrors(errors);
      setActiveTab('photos_signatories');
      toast.error('Please provide an Officer Revision Summary explaining the adjustments made before resubmitting.');
      return false;
    }

    const effectiveSignature = makerSignatureUrl || (currentUser as any)?.signatureUrl;
    if (!effectiveSignature) {
      setValidationErrors(errors);
      setActiveTab('photos_signatories');
      toast.error('Electronic Signature Required', {
        description: 'As the document maker, you must register your official signature before submitting this Post-Activity Report.',
      });
      setIsSignatureModalOpen(true);
      return false;
    }

    setValidationErrors({});
    return true;
  };

  const handleSubmitOrDraft = async (submitForReview: boolean) => {
    if (!selectedEventId) {
      toast.error('Please select an event to submit a Post-Activity Report.');
      return;
    }

    if (submitForReview) {
      if (!isAdviserOrAdmin) {
        toast.error('Only the Organization Adviser or SAS Administrator can formally submit a Post-Activity Report. Officers can Save as Draft.');
        return;
      }
      const isValid = validateFormForSubmission();
      if (!isValid) return;
    }

    const effectiveSignature = makerSignatureUrl || (currentUser as any)?.signatureUrl || '';

    setIsSubmitting(true);
    try {
      const netBalance = totalRevenue - totalDisbursed;

      const payload: PARFormData = {
        id: initialReport?.id,
        referenceNo: initialReport?.referenceNo,
        eventId: selectedEventId,
        eventTitle: selectedEvent?.title || initialReport?.eventTitle || '',
        eventReferenceId: linkedProposal?.referenceNo || selectedEvent?.referenceId || (selectedEvent as any)?.proposalReferenceId || '',
        eventVenue: (selectedEvent as any)?.venueName || (selectedEvent as any)?.venue || initialReport?.eventVenue || 'STI Campus',
        eventDateFormatted: (selectedEvent as any)?.date
          ? `${(selectedEvent as any).date}${(selectedEvent as any).startTime ? `, ${(selectedEvent as any).startTime} – ${(selectedEvent as any).endTime || ''}` : ''}`
          : initialReport?.eventDateFormatted || 'Concluded Event',
        eventDescription: selectedEvent?.description || initialReport?.eventDescription || '',
        organizerName: selectedEvent?.organizerName || currentUser.name,
        actualMechanics: proposedMechanics.join('\n') || '',
        liquidationId: (selectedEvent as any)?.liquidationReportId || (selectedEvent as any)?.liquidationId || initialReport?.liquidationId || '',
        liquidationRefNumber: liquidationRef || (selectedEvent as any)?.liquidationRefNumber || initialReport?.liquidationRefNumber || '',

        // Proposal Copied Fields
        proposalOrganizers: proposalOrganizers.length > 0 ? proposalOrganizers : (initialReport?.proposalOrganizers || []),
        proposedMechanics: proposedMechanics.length > 0 ? proposedMechanics : (initialReport?.proposedMechanics || []),
        proposalMaterials: proposalMaterials.length > 0 ? proposalMaterials : (initialReport?.proposalMaterials || []),
        proposalMarketingPlan: proposalMarketingPlan.length > 0 ? proposalMarketingPlan : (initialReport?.proposalMarketingPlan || []),
        proposalDocumentationPlan: proposalDocumentationPlan.length > 0 ? proposalDocumentationPlan : (initialReport?.proposalDocumentationPlan || []),
        proposalObjectives: proposalObjectives.length > 0 ? proposalObjectives : (initialReport?.proposalObjectives || []),
        proposalSuccessIndicators: proposalSuccessIndicators.length > 0 ? proposalSuccessIndicators : (initialReport?.proposalSuccessIndicators || []),
        materialsUtilized: proposalMaterials,
        marketingConducted: proposalMarketingPlan,

        organizationId: isSasAdmin ? 'sas' : (selectedEvent?.hostingOrgId || currentUser.organizationId || ''),
        organizationName: isSasAdmin ? 'Student Affairs Services (SAS)' : (selectedEvent?.hostingOrgName || currentUser.organizationName || ''),
        organizationAcronym: isSasAdmin ? 'SAS' : ((selectedEvent as any)?.hostingOrgAcronym || 'ORG'),

        attendanceSummary: {
          registeredCount,
          attendedCount,
          turnoutRate,
          targetAudience,
          whoAttended,
          howManyAttended: howManyAttended || (attendedCount ? `${attendedCount} Attendees` : 'Attendance verified from logs'),
        },

        financialSummary: {
          totalRevenue,
          totalDisbursed,
          surplusOrDeficit: netBalance,
          lineItems: financialLineItems,
        },

        results: {
          objectiveStatus,
          objectiveAssessments: [],
          compositeSuccessScore: compositeScore,
          achievementNarrative,
          keyLearnings: keyLearnings.filter(Boolean),
          classroomEnrichment,
          venueAssessment: venueAssessment || '',
          foodAssessment: foodAssessment || '',
          logisticsAssessment: logisticsAssessment || '',
          scheduleCompliance: scheduleCompliance || '',
          issuesEncountered: issuesEncountered || '',
        },

        recommendations: {
          programFlow: {
            observations: progFlowObsList.filter(Boolean).join('\n'),
            recommendations: progFlowRecList.filter(Boolean).join('\n'),
            observationsList: progFlowObsList.filter(Boolean),
            recommendationsList: progFlowRecList.filter(Boolean),
          } as any,
          participantEngagement: {
            observations: engagementObsList.filter(Boolean).join('\n'),
            recommendations: engagementRecList.filter(Boolean).join('\n'),
            observationsList: engagementObsList.filter(Boolean),
            recommendationsList: engagementRecList.filter(Boolean),
          } as any,
          technicalSetup: {
            observations: techSetupObsList.filter(Boolean).join('\n'),
            recommendations: techSetupRecList.filter(Boolean).join('\n'),
            observationsList: techSetupObsList.filter(Boolean),
            recommendationsList: techSetupRecList.filter(Boolean),
          } as any,
          participantPreparedness: {
            observations: prepObsList.filter(Boolean).join('\n'),
            recommendations: prepRecList.filter(Boolean).join('\n'),
            observationsList: prepObsList.filter(Boolean),
            recommendationsList: prepRecList.filter(Boolean),
          } as any,
        },

        photos,
        approvalChain: isOrgFunds
          ? [
              {
                id: 'step_sas_approval',
                step: 1,
                stageIndex: 1,
                stageName: 'SAS Approval',
                role: 'sas_head' as const,
                roleTitle: 'Student Affairs & Services Head',
                actionType: 'approve' as const,
                signatoryUid: 'sas_admin',
                signatoryName: 'Riselle Mae B. Lucanas',
                signatoryEmail: 'sao@ormoc.sti.edu.ph',
                department: 'Student Affairs & Services',
                status: 'current' as const,
              },
            ]
          : approvalChain,
        preparedBy: {
          name: currentUser.name,
          roleTitle: isSasAdmin ? 'SAS Administrator' : 'Organization Adviser',
          signatureUrl: effectiveSignature || '',
          signedAt: new Date().toISOString(),
        },
        ...(effectiveSignature ? { submittedBySignatureUrl: effectiveSignature } : {}),
        ...(submitForReview && isReturnedReport && resubmissionNote.trim()
          ? { resubmissionNote: resubmissionNote.trim() }
          : {}),
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
          ? isReturnedReport
            ? `Post-Activity Report (${result.referenceNo}) resubmitted successfully with revision summary! Route reset to Stage 1.`
            : `Post-Activity Report (${result.referenceNo}) submitted for institutional endorsement!`
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
          <div className="flex items-center gap-2">
            {(selectedEvent || linkedProposal) && (
              <button
                type="button"
                onClick={() => setIsGuidanceDrawerOpen((prev) => !prev)}
                className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95 ${
                  isGuidanceDrawerOpen
                    ? 'bg-white text-[#001A4D] border-white shadow-md ring-2 ring-white/30'
                    : 'bg-white/15 hover:bg-white/25 text-white border-white/25'
                }`}
                title="Toggle side-by-side Activity Proposal Guidance Drawer"
              >
                <BookOpen className={`w-3.5 h-3.5 ${isGuidanceDrawerOpen ? 'text-[#0E4EBD]' : 'text-[#FFD41C]'}`} />
                <span>View AP-01 Reference</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation Navigation */}
        <div className="flex border-b border-slate-200 bg-slate-50/70 px-6 gap-2 pt-2">
          {[
            { id: 'overview', label: '1. Event & Clearance Summary', icon: FileText, isFlagged: isOverviewFlagged },
            { id: 'objectives', label: '2. Results of the Activity', icon: Sparkles, isFlagged: isObjectivesFlagged },
            { id: 'recommendations', label: '3. Remarks', icon: ShieldCheck, isFlagged: isRecommendationsFlagged },
            { id: 'photos_signatories', label: '4. Photos & Pipeline', icon: ImageIcon, isFlagged: isPhotosSignatoriesFlagged },
          ].map((t) => {
            const Icon = t.icon;
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id as WizardTab)}
                className={`flex items-center gap-2 py-3 px-4 text-xs font-bold border-b-2 transition-all rounded-t-lg cursor-pointer ${
                  isActive
                    ? 'border-[#0E4EBD] text-[#0E4EBD] bg-white shadow-sm'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-[#0E4EBD]' : 'text-slate-400'}`} />
                <span>{t.label}</span>
                {t.isFlagged && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 animate-pulse">
                    Needs Revision
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {(initialReport?.status === 'returned' || (initialReport as any)?.isReturned) && (
            <RevisionFeedbackBanner
              returnedBy={{
                name: (initialReport as any).returnedByName || (initialReport as any).returnedBy || 'Institutional Signatory',
                roleTitle: (initialReport as any).returnedByRoleTitle || 'Signatory Reviewer',
                email: (initialReport as any).returnedByEmail,
              }}
              returnedAt={initialReport.returnedAt}
              returnRemarks={initialReport.returnRemarks}
              returnFlags={initialReport.returnFlags}
              stepRevisionRemarks={initialReport.stepRevisionRemarks}
              revisionHistory={initialReport.revisionHistory}
              documentTitle={initialReport.eventTitle}
              documentType="PAR"
              currentDocument={initialReport}
              versionLabel={`v${initialReport.revisionCount || 1}.0`}
              showActionButtons={false}
            />
          )}

          {/* TAB 1: OVERVIEW & CLEARANCE */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {isOverviewFlagged && (
                <div className="p-4 bg-amber-50/90 border-2 border-amber-300 rounded-xl flex items-start gap-3 shadow-xs">
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1 text-xs">
                    <span className="font-bold text-amber-900 uppercase tracking-wider block mb-1">
                      Reviewer Revision Feedback — Event & Clearance Summary
                    </span>
                    <p className="text-amber-800 leading-relaxed font-medium">
                      {initialReport?.stepRevisionRemarks?.['overview'] ||
                        initialReport?.returnRemarks ||
                        'Please verify the event mechanics, attendance count, and linked financial clearance.'}
                    </p>
                  </div>
                </div>
              )}
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
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-4 text-xs text-slate-300">
                      <div>
                        <span className="text-slate-400 block font-medium">Linked AP-01 Ref:</span>
                        <strong className="text-[#FFD41C] font-mono">
                          {linkedProposal?.referenceNo || selectedEvent.referenceId || 'AP-01 Reference'}
                        </strong>
                      </div>
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
                    <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Users className="w-4 h-4 text-blue-600" />
                            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                              Attendance Verification
                            </h4>
                          </div>
                          {hasScannedAttendance ? (
                            <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              Scanner Verified
                            </span>
                          ) : (
                            <span className="text-[11px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full flex items-center gap-1 border border-amber-200">
                              <AlertCircle className="w-3 h-3 text-amber-600" />
                              Manual Entry
                            </span>
                          )}
                        </div>

                        {/* Headcount Inputs / Status */}
                        <div className="grid grid-cols-2 gap-3 mb-3">
                          <div className={`bg-white p-3 rounded-lg border ${validationErrors.registeredCount ? 'border-red-500 ring-1 ring-red-500' : 'border-slate-200'}`}>
                            <label className="text-[11px] font-bold text-slate-600 block mb-1">
                              Registered / Target *
                            </label>
                            <input
                              type="number"
                              min="0"
                              value={registeredCount || ''}
                              onChange={(e) => handleRegisteredCountChange(parseInt(e.target.value, 10) || 0)}
                              placeholder="0"
                              className="w-full text-base font-black text-slate-800 bg-transparent border-b border-slate-200 focus:border-blue-500 focus:outline-none"
                            />
                            {validationErrors.registeredCount && (
                              <span className="text-[10px] text-red-600 font-medium mt-0.5 block">
                                Target count required
                              </span>
                            )}
                          </div>
                          <div className={`bg-white p-3 rounded-lg border ${validationErrors.attendedCount ? 'border-red-500 ring-1 ring-red-500' : 'border-slate-200'}`}>
                            <label className="text-[11px] font-bold text-blue-700 block mb-1">
                              Actual Attended *
                            </label>
                            <input
                              type="number"
                              min="0"
                              value={attendedCount || ''}
                              onChange={(e) => handleAttendedCountChange(parseInt(e.target.value, 10) || 0)}
                              placeholder="0"
                              className="w-full text-base font-black text-blue-700 bg-transparent border-b border-blue-200 focus:border-blue-500 focus:outline-none"
                            />
                            {validationErrors.attendedCount && (
                              <span className="text-[10px] text-red-600 font-medium mt-0.5 block">
                                Attended count required
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Turnout Indicator */}
                        <div className="bg-white p-2 rounded-lg border border-slate-200 mb-3 flex items-center justify-between">
                          <span className="text-xs font-semibold text-slate-600">Calculated Turnout:</span>
                          <span className={`text-xs font-black px-2 py-0.5 rounded-full ${
                            turnoutRate >= 80
                              ? 'bg-emerald-100 text-emerald-800'
                              : turnoutRate >= 50
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}>
                            {turnoutRate}% Turnout ({attendedCount} / {registeredCount || 0})
                          </span>
                        </div>

                        {/* Audience Profile Fields (De-duplicated) */}
                        <div className="space-y-2 text-xs">
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-slate-600 font-bold flex items-center gap-1.5 text-xs">
                                <Lock className="w-3.5 h-3.5 text-slate-400" />
                                <span>Target Audience (from Form AP-01)</span>
                              </label>
                              <span className="text-[10px] text-slate-500 font-medium bg-slate-200/70 px-1.5 py-0.5 rounded">
                                Pre-populated (Readonly)
                              </span>
                            </div>
                            <input
                              type="text"
                              value={targetAudience || 'General Student Body'}
                              readOnly
                              disabled
                              className="w-full bg-slate-100 border border-slate-200 rounded-lg p-2 text-xs text-slate-700 font-medium cursor-not-allowed select-none"
                            />
                          </div>
                          <div>
                            <label className="text-slate-600 font-bold block mb-1">
                              Actual Participant Profile (Who Attended?) *
                            </label>
                            <input
                              type="text"
                              value={whoAttended}
                              onChange={(e) => {
                                setWhoAttended(e.target.value);
                                if (validationErrors.whoAttended && e.target.value.trim()) {
                                  setValidationErrors((prev) => ({ ...prev, whoAttended: false }));
                                }
                              }}
                              className={`w-full bg-white border rounded-lg p-2 text-xs text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none ${
                                validationErrors.whoAttended ? 'border-red-500 ring-1 ring-red-500' : 'border-slate-300'
                              }`}
                              placeholder="e.g. 1st & 2nd Year BSIT Students, Club Officers"
                            />
                            {validationErrors.whoAttended && (
                              <span className="text-[10px] text-red-600 font-medium mt-0.5 block">
                                Participant profile description required
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Financial Projection from AP-01 */}
                    <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <DollarSign className="w-4 h-4 text-emerald-600" />
                          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                            Financial Report (Approved Form AP-01 Budget Projection)
                          </h4>
                        </div>
                        <span className="text-[11px] font-bold text-blue-700 bg-blue-100 px-2.5 py-0.5 rounded-full border border-blue-200">
                          From AP-01
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center mb-3">
                        <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                          <span className="text-[10px] text-slate-500 block">Approved Allocation</span>
                          <span className="text-sm font-bold text-[#001A4D] font-mono">
                            {formatCurrency(totalRevenue)}
                          </span>
                        </div>
                        <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                          <span className="text-[10px] text-slate-500 block">Projected Expenses</span>
                          <span className="text-sm font-bold text-slate-800 font-mono">
                            {formatCurrency(totalDisbursed)}
                          </span>
                        </div>
                        <div
                          className={`p-2.5 rounded-lg border ${
                            isSurplus ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'
                          }`}
                        >
                          <span className="text-[10px] block font-medium">Projected Balance</span>
                          <span className="text-sm font-bold font-mono">
                            {formatVariance(netBalance)}
                          </span>
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Financial figures are populated directly from the approved Activity Proposal{liquidationRef ? ` (${liquidationRef})` : ''}.
                      </p>
                    </div>
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

          {/* TAB 2: RESULTS OF THE ACTIVITY */}
          {activeTab === 'objectives' && (
            <div className="space-y-6">
              {isObjectivesFlagged && (
                <div className="p-4 bg-amber-50/90 border-2 border-amber-300 rounded-xl flex items-start gap-3 shadow-xs">
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1 text-xs">
                    <span className="font-bold text-amber-900 uppercase tracking-wider block mb-1">
                      Reviewer Revision Feedback — Results of the Activity
                    </span>
                    <p className="text-amber-800 leading-relaxed font-medium">
                      {initialReport?.stepRevisionRemarks?.['objectives'] ||
                        initialReport?.returnRemarks ||
                        'Please review and update the results of the activity.'}
                    </p>
                  </div>
                </div>
              )}

              {/* 1. Achievement of Objectives */}
              <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-2xs space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                      <Target className="w-4 h-4 text-[#0E4EBD]" />
                      <span>1. Achievement of Objectives <span className="text-red-500">*</span></span>
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Review the planned objectives from Form AP-01 and provide an institutional narrative of how they were met.
                    </p>
                  </div>
                  <AIAssistButton
                    label="Enhance Narrative"
                    onClick={handleEnhanceNarrative}
                    isLoading={isAILoading && aiTargetField === 'narrative'}
                    disabled={Boolean((isAILoading || isGeneratingRecs) && !(isAILoading && aiTargetField === 'narrative'))}
                    tooltip="Draft or elevate accomplishment narrative using attendance and event data"
                  />
                </div>

                {/* Objectives from linked AP */}
                <div className="p-3.5 bg-blue-50/50 border border-blue-200/70 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#001A4D] flex items-center gap-1">
                      <Award className="w-3.5 h-3.5 text-[#0E4EBD]" />
                      Planned Objectives (from Linked Form AP-01)
                    </span>
                    <span className="text-[10px] font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                      {(proposalObjectives.length > 0 ? proposalObjectives : objectiveAssessments).length} Objective(s)
                    </span>
                  </div>

                  {(proposalObjectives.length > 0 ? proposalObjectives : objectiveAssessments.map((o) => o.objectiveText)).length === 0 ? (
                    <p className="text-xs text-slate-500 italic">No specific objectives were found in the linked proposal.</p>
                  ) : (
                    <ul className="space-y-1.5 text-xs text-slate-700">
                      {(proposalObjectives.length > 0 ? proposalObjectives : objectiveAssessments.map((o) => o.objectiveText)).map((obj, i) => (
                        <li key={i} className="flex items-start gap-2 bg-white/80 p-2 rounded-lg border border-blue-100/60">
                          <span className="text-[#0E4EBD] font-bold shrink-0 mt-0.5">•</span>
                          <div className="flex-1">
                            <span className="font-semibold text-slate-800">{obj}</span>
                            {proposalSuccessIndicators[i] && (
                              <p className="text-[11px] text-slate-500 mt-0.5">
                                <span className="font-medium text-slate-600">Target KPI: </span>{proposalSuccessIndicators[i]}
                              </p>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Narrative Textarea */}
                <div>
                  <textarea
                    rows={4}
                    value={achievementNarrative}
                    onChange={(e) => {
                      setAchievementNarrative(e.target.value);
                      if (validationErrors.achievementNarrative && e.target.value.trim().length >= 10) {
                        setValidationErrors((prev) => ({ ...prev, achievementNarrative: false }));
                      }
                    }}
                    placeholder="Detail how the activity met its designated educational and co-curricular objectives..."
                    className={`w-full text-xs bg-white border rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none ${
                      validationErrors.achievementNarrative ? 'border-red-500 ring-1 ring-red-500' : 'border-slate-300'
                    }`}
                  />
                  {validationErrors.achievementNarrative && (
                    <span className="text-[10px] text-red-600 font-medium mt-0.5 block">
                      Achievement of objectives narrative is required.
                    </span>
                  )}
                </div>
              </div>

              {/* 2. Key Learnings / Insights Gained */}
              <div className={`border rounded-xl p-4 bg-white shadow-2xs space-y-3 ${
                validationErrors.keyLearnings ? 'border-red-500 ring-1 ring-red-500' : 'border-slate-200'
              }`}>
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      2. Key Learnings / Insights Gained <span className="text-red-500">*</span>
                    </label>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Key learning takeaways and student insights from the activity.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <AIAssistButton
                      label="Suggest Learnings"
                      onClick={handleSuggestKeyLearningsAction}
                      isLoading={isAILoading && aiTargetField === 'learnings'}
                      disabled={Boolean((isAILoading || isGeneratingRecs) && !(isAILoading && aiTargetField === 'learnings'))}
                      tooltip="Generate key learnings from executed activity"
                    />
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                      {keyLearnings.length} added
                    </span>
                  </div>
                </div>
                {validationErrors.keyLearnings && (
                  <span className="text-[11px] text-red-600 font-medium block">
                    At least 1 key learning insight must be added.
                  </span>
                )}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newLearningInput}
                    onChange={(e) => setNewLearningInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddLearning();
                        if (validationErrors.keyLearnings && (keyLearnings.length + 1 >= 1)) {
                          setValidationErrors((prev) => ({ ...prev, keyLearnings: false }));
                        }
                      }
                    }}
                    placeholder="Enter an insight or learning takeaway..."
                    className="flex-1 bg-white border border-slate-300 rounded-lg p-2 text-xs text-slate-800"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      handleAddLearning();
                      if (validationErrors.keyLearnings && (keyLearnings.length + 1 >= 1)) {
                        setValidationErrors((prev) => ({ ...prev, keyLearnings: false }));
                      }
                    }}
                    className="bg-[#0E4EBD] hover:bg-[#001A4D] text-white px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Plus className="w-4 h-4" /> Add
                  </button>
                </div>
                {keyLearnings.length > 0 && (
                  <div className="space-y-1.5">
                    {keyLearnings.map((item, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg text-xs text-slate-800 shadow-2xs"
                      >
                        <span className="flex-1 pr-2">
                          <strong className="text-blue-700 font-bold mr-1.5">•</strong>
                          {item}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveLearning(idx)}
                          className="text-slate-400 hover:text-red-600 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 3. Enrichment of Learning Beyond the Classroom */}
              <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-2xs space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                      3. Enrichment of Learning Beyond the Classroom
                    </label>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      (Explain how the activity complemented or enhanced classroom learning)
                    </p>
                  </div>
                  <AIAssistButton
                    label="Draft Enrichment"
                    onClick={handleEnhanceCurriculumEnrichment}
                    isLoading={isAILoading && aiTargetField === 'enrichment'}
                    disabled={Boolean((isAILoading || isGeneratingRecs) && !(isAILoading && aiTargetField === 'enrichment'))}
                    tooltip="Draft institutional alignment with classroom curriculum and STI graduate attributes"
                  />
                </div>
                <textarea
                  rows={2}
                  value={classroomEnrichment}
                  onChange={(e) => setClassroomEnrichment(e.target.value)}
                  placeholder="Explain how the activity complemented or enhanced classroom learning..."
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              {/* 4. Reason for Venue Selection & 5. Food / Logistics Assessment */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-2xs space-y-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                    4. Reason for Venue Selection
                  </label>
                  <p className="text-[11px] text-slate-500">
                    (State justification if questioned or compared to another venue)
                  </p>
                  <textarea
                    rows={2}
                    value={venueAssessment}
                    onChange={(e) => setVenueAssessment(e.target.value)}
                    placeholder="State justification if questioned or compared to another venue..."
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-2xs space-y-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                    5. Food / Logistics Assessment
                  </label>
                  <p className="text-[11px] text-slate-500">
                    (State food quantity/quality and logistics handling)
                  </p>
                  <textarea
                    rows={2}
                    value={foodAssessment}
                    onChange={(e) => {
                      setFoodAssessment(e.target.value);
                      setLogisticsAssessment(e.target.value);
                    }}
                    placeholder="State food quantity/quality and logistics handling..."
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* 6. Schedule Compliance & 7. Issues / Problems Encountered */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-2xs space-y-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                    6. Schedule Compliance
                  </label>
                  <p className="text-[11px] text-slate-500">
                    (State if program followed as planned; mention delays or adjustments if any)
                  </p>
                  <textarea
                    rows={2}
                    value={scheduleCompliance}
                    onChange={(e) => setScheduleCompliance(e.target.value)}
                    placeholder="State if program followed as planned; mention delays or adjustments if any..."
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-2xs space-y-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                    7. Issues / Problems Encountered and Actions Taken
                  </label>
                  <p className="text-[11px] text-slate-500">
                    (If none, state “No major issues encountered.”)
                  </p>
                  <textarea
                    rows={2}
                    value={issuesEncountered}
                    onChange={(e) => setIssuesEncountered(e.target.value)}
                    placeholder="If none, state “No major issues encountered.”"
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: REMARKS */}
          {activeTab === 'recommendations' && (
            <div className="space-y-6">
              {isRecommendationsFlagged && (
                <div className="p-4 bg-amber-50/90 border-2 border-amber-300 rounded-xl flex items-start gap-3 shadow-xs">
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1 text-xs">
                    <span className="font-bold text-amber-900 uppercase tracking-wider block mb-1">
                      Reviewer Revision Feedback — Remarks
                    </span>
                    <p className="text-amber-800 leading-relaxed font-medium">
                      {initialReport?.stepRevisionRemarks?.['recommendations'] ||
                        initialReport?.returnRemarks ||
                        'Please refine your observations and recommendations across the four key STI institutional areas.'}
                    </p>
                  </div>
                </div>
              )}
              <div className="bg-blue-50/70 p-4 rounded-xl border border-blue-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-[#001A4D] flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-[#0E4EBD]" />
                    3. Remarks (For Future Activity Improvements)
                  </h4>
                  <p className="text-xs text-slate-600 mt-1">
                    Add itemized observations and actionable recommendations across the four standard STI institutional areas. You can add as many items as needed for each.
                  </p>
                </div>
                <AIAssistButton
                  label="Auto-Draft Remarks"
                  onClick={handleAutoDraft4Recommendations}
                  isLoading={isGeneratingRecs}
                  disabled={isAILoading || isGeneratingRecs}
                  variant="primary"
                  tooltip="Generate observations and recommendations for Program Flow, Engagement, Tech Setup, and Prep"
                />
              </div>

              {/* 1. Program Flow and Time Management */}
              <DynamicRemarkCategory
                number="1"
                title="Program Flow and Time Management"
                obsList={progFlowObsList}
                recList={progFlowRecList}
                onUpdateObs={(idx, val) => handleUpdateRemarkItem(setProgFlowObsList, idx, val)}
                onUpdateRec={(idx, val) => handleUpdateRemarkItem(setProgFlowRecList, idx, val)}
                onAddObs={() => handleAddRemarkItem(setProgFlowObsList)}
                onAddRec={() => handleAddRemarkItem(setProgFlowRecList)}
                onRemoveObs={(idx) => handleRemoveRemarkItem(setProgFlowObsList, idx)}
                onRemoveRec={(idx) => handleRemoveRemarkItem(setProgFlowRecList, idx)}
                errorObs={validationErrors.progFlow}
                errorRec={validationErrors.progFlow}
              />

              {/* 2. Participant Engagement and Interaction */}
              <DynamicRemarkCategory
                number="2"
                title="Participant Engagement and Interaction"
                obsList={engagementObsList}
                recList={engagementRecList}
                onUpdateObs={(idx, val) => handleUpdateRemarkItem(setEngagementObsList, idx, val)}
                onUpdateRec={(idx, val) => handleUpdateRemarkItem(setEngagementRecList, idx, val)}
                onAddObs={() => handleAddRemarkItem(setEngagementObsList)}
                onAddRec={() => handleAddRemarkItem(setEngagementRecList)}
                onRemoveObs={(idx) => handleRemoveRemarkItem(setEngagementObsList, idx)}
                onRemoveRec={(idx) => handleRemoveRemarkItem(setEngagementRecList, idx)}
                errorObs={validationErrors.engagement}
                errorRec={validationErrors.engagement}
              />

              {/* 3. Technical Setup and Venue Preparation */}
              <DynamicRemarkCategory
                number="3"
                title="Technical Setup and Venue Preparation"
                obsList={techSetupObsList}
                recList={techSetupRecList}
                onUpdateObs={(idx, val) => handleUpdateRemarkItem(setTechSetupObsList, idx, val)}
                onUpdateRec={(idx, val) => handleUpdateRemarkItem(setTechSetupRecList, idx, val)}
                onAddObs={() => handleAddRemarkItem(setTechSetupObsList)}
                onAddRec={() => handleAddRemarkItem(setTechSetupRecList)}
                onRemoveObs={(idx) => handleRemoveRemarkItem(setTechSetupObsList, idx)}
                onRemoveRec={(idx) => handleRemoveRemarkItem(setTechSetupRecList, idx)}
                errorObs={validationErrors.techSetup}
                errorRec={validationErrors.techSetup}
              />

              {/* 4. Participant Preparedness and Expectations */}
              <DynamicRemarkCategory
                number="4"
                title="Participant Preparedness and Expectations"
                obsList={prepObsList}
                recList={prepRecList}
                onUpdateObs={(idx, val) => handleUpdateRemarkItem(setPrepObsList, idx, val)}
                onUpdateRec={(idx, val) => handleUpdateRemarkItem(setPrepRecList, idx, val)}
                onAddObs={() => handleAddRemarkItem(setPrepObsList)}
                onAddRec={() => handleAddRemarkItem(setPrepRecList)}
                onRemoveObs={(idx) => handleRemoveRemarkItem(setPrepObsList, idx)}
                onRemoveRec={(idx) => handleRemoveRemarkItem(setPrepRecList, idx)}
                errorObs={validationErrors.prep}
                errorRec={validationErrors.prep}
              />
            </div>
          )}

          {/* TAB 4: PHOTOS & SIGNATORIES PIPELINE */}
          {activeTab === 'photos_signatories' && (
            <div className="space-y-6">
              {isPhotosSignatoriesFlagged && (
                <div className="p-4 bg-amber-50/90 border-2 border-amber-300 rounded-xl flex items-start gap-3 shadow-xs">
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1 text-xs">
                    <span className="font-bold text-amber-900 uppercase tracking-wider block mb-1">
                      Reviewer Revision Feedback — Documentation & Signatories
                    </span>
                    <p className="text-amber-800 leading-relaxed font-medium">
                      {initialReport?.stepRevisionRemarks?.['photos_signatories'] ||
                        initialReport?.returnRemarks ||
                        'Please provide required photographic documentation and verify the institutional signatory route.'}
                    </p>
                  </div>
                </div>
              )}
              {/* Photo Documentation Section */}
              <div className={`border rounded-xl p-4 bg-slate-50/50 space-y-4 ${
                validationErrors.photos ? 'border-red-500 ring-1 ring-red-500' : 'border-slate-200'
              }`}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                      <ImageIcon className="w-4 h-4 text-blue-600" />
                      <span>Photo Documentation Gallery</span>
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Upload high-resolution event documentation photos from your computer.
                    </p>
                  </div>
                  {photos.length > 0 && (
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200 self-start sm:self-auto">
                      📷 {photos.length} Photo{photos.length > 1 ? 's' : ''} Attached
                    </span>
                  )}
                </div>

                {validationErrors.photos && (
                  <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-medium flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                    <span>Please attach at least one photo for event documentation.</span>
                  </div>
                )}

                {/* Multi-Photo File Selector */}
                <div className="bg-white p-3.5 rounded-xl border border-slate-200">
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    <label
                      htmlFor="par-multi-photo-file-input"
                      className="px-4 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-2xs bg-[#001A4D] hover:bg-[#002D72] text-white"
                    >
                      <Upload className="w-4 h-4 text-[#FFD41C]" />
                      <span>Select Multiple Photos from Device</span>
                      <input
                        id="par-multi-photo-file-input"
                        type="file"
                        multiple
                        accept="image/*"
                        className="hidden"
                        onChange={handleMultipleFilesUpload}
                      />
                    </label>
                    <span className="text-xs text-slate-400 font-medium text-center sm:text-left">
                      Hold Ctrl or Shift to choose multiple image files at once (.jpg, .png, .webp)
                    </span>
                  </div>
                </div>

                {/* Photo Previews */}
                {photos.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-2">
                    {photos.map((p, idx) => (
                      <div
                        key={p.id}
                        className="group relative rounded-xl overflow-hidden border border-slate-200 bg-white shadow-2xs aspect-square flex flex-col justify-between"
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
                        <div className="absolute top-1 right-1">
                          <button
                            type="button"
                            onClick={() => handleRemovePhoto(p.id)}
                            title="Remove photo"
                            className="bg-red-600/90 hover:bg-red-700 text-white p-1 rounded-full shadow-md transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/85 via-black/50 to-transparent p-1.5 text-white">
                          <span className="text-[10px] font-bold truncate block leading-tight">
                            #{idx + 1} {p.caption || 'Photo'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-6 text-center border-2 border-dashed border-slate-200 rounded-xl bg-white text-slate-400">
                    <ImageIcon className="w-8 h-8 mx-auto mb-1.5 text-slate-300" />
                    <p className="text-xs font-semibold text-slate-600">No photos attached yet.</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Select event photos from your device to complete documentation.
                    </p>
                  </div>
                )}
              </div>

              {/* Dynamic Institutional Signatory Pipeline Builder */}
              {isOrgFunds ? (
                <div className="p-4 bg-emerald-50/90 border border-emerald-300 rounded-2xl flex items-start gap-3.5 shadow-xs">
                  <div className="p-2 bg-emerald-100 rounded-xl text-emerald-800 shrink-0">
                    <Coins className="w-5 h-5 text-emerald-700" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold text-emerald-950 uppercase tracking-wider">
                      Organization Internal Funds — Direct SAS Approval
                    </h4>
                    <p className="text-xs text-emerald-900/90 leading-relaxed">
                      This activity is funded entirely from organization treasury funds. Institutional signatory pipelines (School Director, Academic Head, Assistant Principals) are not required. This report routes directly to <strong>Student Affairs & Services (SAS)</strong> for official institutional review, digital approval, and signature.
                    </p>
                  </div>
                </div>
              ) : (
                <PARFlowBuilder
                  approvalChain={approvalChain}
                  onChange={setApprovalChain}
                  activeSignatories={activeSignatories}
                  orgId={selectedEvent?.hostingOrgId || currentUser.organizationId}
                  orgName={selectedEvent?.hostingOrgName || (isSasAdmin ? 'Student Affairs Services' : undefined)}
                  isSasCreator={isSasAdmin || (selectedEvent ? isSasInstitutionalActivity(selectedEvent) : false)}
                />
              )}

              {/* Officer Revision Summary Card (Mandatory on Resubmission) */}
              {isReturnedReport && (
                <div className="p-4 bg-amber-50/80 border-2 border-amber-300 rounded-xl space-y-2">
                  <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
                    <RotateCcw className="w-4 h-4 text-amber-700" />
                    <span>Officer Revision Summary (Required)</span>
                  </div>
                  <p className="text-xs text-amber-800">
                    Summarize the modifications, narrative clarifications, or newly attached documentation provided in response to the reviewers.
                  </p>
                  <textarea
                    value={resubmissionNote}
                    onChange={(e) => setResubmissionNote(e.target.value)}
                    placeholder="e.g. Added 4 high-resolution event photos; refined Section 3 recommendations per SAS feedback."
                    rows={3}
                    className="w-full text-xs p-3 border border-amber-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
                  />
                </div>
              )}
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
                className="px-3 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 bg-white border border-slate-300 rounded-lg flex items-center gap-1 cursor-pointer"
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
                className="px-3 py-2 text-xs font-bold text-slate-700 hover:text-slate-900 bg-white border border-slate-300 rounded-lg flex items-center gap-1 cursor-pointer"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {!isAdviserOrAdmin && (
              <div className="flex items-center gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg">
                <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span><strong>Drafting Mode:</strong> Officers can save drafts. Only your Club Adviser can submit for endorsement.</span>
              </div>
            )}
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleSubmitOrDraft(false)}
              className="px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200 bg-slate-100 border border-slate-300 rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              Save Draft
            </button>
            {isAdviserOrAdmin && (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => handleSubmitOrDraft(true)}
                className="px-5 py-2 text-xs font-black text-white bg-gradient-to-r from-[#0E4EBD] to-[#001A4D] hover:opacity-95 shadow-md rounded-lg flex items-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 text-[#FFD41C]" />
                    {isReturnedReport ? 'Resubmit Post-Activity Report' : 'Submit for Endorsement'}
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* AI Suggestion Preview Modal */}
      <AISuggestionModal
        isOpen={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        title={aiModalTitle}
        description={aiModalDesc}
        originalText={aiOriginalText}
        suggestionText={aiSuggestionText}
        suggestionList={aiSuggestionList}
        mode={aiModalMode}
        isLoading={isAILoading}
        onApplyText={handleApplyAIText}
        onApplyList={handleApplyAIList}
        onRegenerate={() => {
          if (activeAIAction) activeAIAction();
        }}
      />

      {/* Side-by-Side Activity Proposal Guidance Drawer */}
      <PARProposalGuidanceDrawer
        isOpen={isGuidanceDrawerOpen}
        onClose={() => setIsGuidanceDrawerOpen(false)}
        proposalData={linkedProposal}
        eventData={selectedEvent}
        onCopyText={(text, label) => {
          navigator.clipboard.writeText(text);
          toast.success(`Copied ${label} from Proposal!`);
        }}
      />

      {/* Inline Digital Signature Modal for Document Maker */}
      {isSignatureModalOpen && (
        <DigitalSignatureModal
          isOpen={isSignatureModalOpen}
          onClose={() => setIsSignatureModalOpen(false)}
          signatoryUid={currentUser?.uid}
          signatoryName={currentUser?.name}
          signatoryEmail={currentUser?.email}
          currentSignatureUrl={makerSignatureUrl}
          onSignatureSaved={(newUrl) => {
            setMakerSignatureUrl(newUrl);
            syncUserSignatureAcrossProfiles({
              uid: currentUser?.uid,
              email: currentUser?.email,
              name: currentUser?.name,
              signatureUrl: newUrl,
              role: currentUser?.role,
            });
            const raw = localStorage.getItem('sti_sync_officer_session');
            if (raw) {
              try {
                const parsed = JSON.parse(raw);
                parsed.signatureUrl = newUrl;
                localStorage.setItem('sti_sync_officer_session', JSON.stringify(parsed));
              } catch {}
            }
          }}
        />
      )}
    </div>
  );
}
