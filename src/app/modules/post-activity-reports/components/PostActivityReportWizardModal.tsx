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
  const [resubmissionNote, setResubmissionNote] = useState('');

  const isReturnedReport = Boolean(
    initialReport?.status === 'returned' ||
    (initialReport as any)?.isReturned
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
  const [targetAudience, setTargetAudience] = useState('');
  const [whoAttended, setWhoAttended] = useState('');
  const [howManyAttended, setHowManyAttended] = useState('');

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
  const [achievementNarrative, setAchievementNarrative] = useState('');
  const [keyLearnings, setKeyLearnings] = useState<string[]>([]);
  const [newLearningInput, setNewLearningInput] = useState('');
  const [classroomEnrichment, setClassroomEnrichment] = useState('');
  const [venueAssessment, setVenueAssessment] = useState('');
  const [foodAssessment, setFoodAssessment] = useState('');
  const [logisticsAssessment, setLogisticsAssessment] = useState('');
  const [scheduleCompliance, setScheduleCompliance] = useState('');
  const [issuesEncountered, setIssuesEncountered] = useState('');

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
  const [activeSignatories, setActiveSignatories] = useState<InstitutionalSignatory[]>([]);

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
    const recs = await generatePARRecommendations(selectedEvent.title, issuesEncountered, actualMechanics);
    setIsGeneratingRecs(false);
    if (recs) {
      if (recs.programFlow) {
        setProgFlowObs(recs.programFlow.observations || '');
        setProgFlowRec(recs.programFlow.recommendations || '');
      }
      if (recs.participantEngagement) {
        setEngagementObs(recs.participantEngagement.observations || '');
        setEngagementRec(recs.participantEngagement.recommendations || '');
      }
      if (recs.technicalSetup) {
        setTechSetupObs(recs.technicalSetup.observations || '');
        setTechSetupRec(recs.technicalSetup.recommendations || '');
      }
      if (recs.participantPreparedness) {
        setPrepObs(recs.participantPreparedness.observations || '');
        setPrepRec(recs.participantPreparedness.recommendations || '');
      }
      toast.success('Successfully drafted 4 STI recommendation categories!');
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

        // Auto-extract proposal fields
        const orgs =
          Array.isArray((evData as any).organizers) && (evData as any).organizers.length > 0
            ? (evData as any).organizers
            : [(evData as any).organizerName || evData.hostingOrgName || 'Student Affairs Services'];
        setProposalOrganizers(orgs);

        const mechs = Array.isArray((evData as any).mechanics) ? (evData as any).mechanics : [];
        setProposedMechanics(mechs);

        const mats = Array.isArray((evData as any).materials) ? (evData as any).materials : [];
        setProposalMaterials(mats);

        const mkt = Array.isArray((evData as any).marketingPlan) ? (evData as any).marketingPlan : [];
        setProposalMarketingPlan(mkt);

        const docs = Array.isArray((evData as any).documentationPlan) ? (evData as any).documentationPlan : [];
        setProposalDocumentationPlan(docs);

        const objs = Array.isArray((evData as any).objectives) ? (evData as any).objectives : [];
        setProposalObjectives(objs);

        const ind = Array.isArray((evData as any).successIndicators) ? (evData as any).successIndicators : [];
        setProposalSuccessIndicators(ind);

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
          setHowManyAttended(`${attCount || regCount} Attendees`);
        } catch {
          setAttendedCount(50);
          setRegisteredCount(50);
          setHowManyAttended('50 Attendees');
        }

        // Auto-fetch financial liquidation summary (Form LF-01)
        let liqId = (evData as any).liquidationReportId || (evData as any).liquidationId;
        if (!liqId) {
          try {
            const liqQuery = await getDocs(
              query(collection(db, LIQUIDATIONS_COLLECTION), where('eventId', '==', selectedEventId))
            );
            const foundLiq = liqQuery.docs.find((d) => {
              const data = d.data();
              const st = (data.status || '').toLowerCase();
              return st !== 'voided' && st !== 'cancelled' && data.isDeleted !== true;
            });
            if (foundLiq) {
              liqId = foundLiq.id;
            }
          } catch (qErr) {
            console.warn('[PostActivityReportWizardModal] Error querying liquidation by eventId:', qErr);
          }
        }

        if (liqId) {
          try {
            const liqSnap = await getDoc(
              doc(db, LIQUIDATIONS_COLLECTION, liqId)
            );
            if (liqSnap.exists() && (liqSnap.data() as any).isDeleted !== true) {
              const liqData = liqSnap.data() as any;
              setLiquidationRef(liqData.referenceNo || (evData as any).liquidationRefNumber || '');
              
              const rev = Number(liqData.actualRevenueTotal ?? liqData.allocatedBudget ?? liqData.totalBudget ?? 0);
              const items = Array.isArray(liqData.lineItems) ? liqData.lineItems : [];
              const computedExpenses = items.reduce((acc: number, it: any) => {
                const cost = Number(it.totalCost ?? it.total ?? it.actualCost ?? (Number(it.quantity || 1) * Number(it.unitCost || it.unitPrice || 0)) ?? 0);
                return acc + cost;
              }, 0);
              const disb = Number(liqData.totalDisbursed ?? liqData.totalExpenses ?? computedExpenses);

              setTotalRevenue(rev);
              setTotalDisbursed(disb);

              setFinancialLineItems(
                items.map((li: any) => ({
                  description: li.particulars || li.description || li.item || 'Expense Item',
                  unitAmount: Number(li.unitCost || li.unitPrice || li.actualCost || 0),
                  totalAmount: Number(li.totalCost || li.total || li.actualCost || li.totalAmount || (Number(li.quantity || 1) * Number(li.unitCost || li.unitPrice || 0)) || 0),
                }))
              );
            }
          } catch {}
        } else {
          setLiquidationRef((evData as any).liquidationRefNumber || 'N/A (Self-Funded)');
        }

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
      if (isReturnedReport && !resubmissionNote.trim()) {
        setActiveTab('photos_signatories');
        toast.error('Please provide an Officer Revision Summary explaining the adjustments made before resubmitting.');
        return;
      }
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
        eventVenue: (selectedEvent as any)?.venueName || (selectedEvent as any)?.venue || initialReport?.eventVenue || 'STI Campus',
        eventDateFormatted: (selectedEvent as any)?.date
          ? `${(selectedEvent as any).date}${(selectedEvent as any).startTime ? `, ${(selectedEvent as any).startTime} – ${(selectedEvent as any).endTime || ''}` : ''}`
          : initialReport?.eventDateFormatted || 'Concluded Event',
        eventDescription: selectedEvent?.description || initialReport?.eventDescription || '',
        organizerName: selectedEvent?.organizerName || currentUser.name,
        actualMechanics,
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
          targetAudience,
          whoAttended,
          howManyAttended: howManyAttended || (attendedCount ? `${attendedCount} Attendees` : '50 Attendees'),
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
          venueAssessment: venueAssessment || '',
          foodAssessment: foodAssessment || '',
          logisticsAssessment: logisticsAssessment || '',
          scheduleCompliance: scheduleCompliance || '',
          issuesEncountered: issuesEncountered || '',
        },

        recommendations: {
          programFlow: {
            observations: progFlowObs || '',
            recommendations: progFlowRec || '',
          },
          participantEngagement: {
            observations: engagementObs || '',
            recommendations: engagementRec || '',
          },
          technicalSetup: {
            observations: techSetupObs || '',
            recommendations: techSetupRec || '',
          },
          participantPreparedness: {
            observations: prepObs || '',
            recommendations: prepRec || '',
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
            { id: 'overview', label: '1. Event & Clearance Summary', icon: FileText, isFlagged: isOverviewFlagged },
            { id: 'objectives', label: '2. Objectives & Learnings', icon: Sparkles, isFlagged: isObjectivesFlagged },
            { id: 'recommendations', label: '3. STI Recommendations', icon: ShieldCheck, isFlagged: isRecommendationsFlagged },
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
                            How Many Attended?
                          </label>
                          <input
                            type="text"
                            value={howManyAttended}
                            onChange={(e) => setHowManyAttended(e.target.value)}
                            className="w-full bg-white border border-slate-300 rounded p-1.5 text-xs text-slate-800"
                            placeholder="e.g. 110 IT students"
                          />
                        </div>
                        <div>
                          <label className="text-slate-500 font-semibold block mb-1">
                            Actual Participant Profile (Who Attended?)
                          </label>
                          <input
                            type="text"
                            value={whoAttended}
                            onChange={(e) => setWhoAttended(e.target.value)}
                            className="w-full bg-white border border-slate-300 rounded p-1.5 text-xs text-slate-800"
                            placeholder="e.g. BSIT all year level"
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
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                        Actual Mechanics & Logistics Conducted (Optional Notes)
                      </label>
                      <AIAssistButton
                        label="Polish Mechanics"
                        onClick={handleEnhanceActualMechanics}
                        isLoading={isAILoading && aiTargetField === 'mechanics'}
                        tooltip="Polish actual mechanics notes into formal narrative"
                      />
                    </div>
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
              {isObjectivesFlagged && (
                <div className="p-4 bg-amber-50/90 border-2 border-amber-300 rounded-xl flex items-start gap-3 shadow-xs">
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1 text-xs">
                    <span className="font-bold text-amber-900 uppercase tracking-wider block mb-1">
                      Reviewer Revision Feedback — Objectives & Learnings
                    </span>
                    <p className="text-amber-800 leading-relaxed font-medium">
                      {initialReport?.stepRevisionRemarks?.['objectives'] ||
                        initialReport?.returnRemarks ||
                        'Please review and update the objectives achievement narrative, learnings, or event assessments.'}
                    </p>
                  </div>
                </div>
              )}
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
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                    Narrative of Accomplishments & Results *
                  </label>
                  <AIAssistButton
                    label="Enhance Narrative"
                    onClick={handleEnhanceNarrative}
                    isLoading={isAILoading && aiTargetField === 'narrative'}
                    tooltip="Draft or elevate accomplishment narrative using attendance and event data"
                  />
                </div>
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
                  <div className="flex items-center gap-2">
                    <AIAssistButton
                      label="Suggest Learnings"
                      onClick={handleSuggestKeyLearningsAction}
                      isLoading={isAILoading && aiTargetField === 'learnings'}
                      tooltip="Generate key learnings from executed activity"
                    />
                    <span className="text-[11px] text-slate-400 font-medium">
                      {keyLearnings.length} added
                    </span>
                  </div>
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

              {/* Operational & Assessment Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Reason for Venue Selection
                  </label>
                  <input
                    type="text"
                    value={venueAssessment}
                    onChange={(e) => setVenueAssessment(e.target.value)}
                    placeholder="e.g. It provided convenient and immediate access for participants."
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
                    placeholder="If none, state 'No major issues encountered.'"
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs text-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Food & Logistics Assessment
                  </label>
                  <textarea
                    rows={2}
                    value={foodAssessment}
                    onChange={(e) => setFoodAssessment(e.target.value)}
                    placeholder="State food quantity/quality and logistics handling..."
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Schedule Compliance
                  </label>
                  <textarea
                    rows={2}
                    value={scheduleCompliance}
                    onChange={(e) => setScheduleCompliance(e.target.value)}
                    placeholder="State if program followed as planned; mention delays or adjustments if any."
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs text-slate-800"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: 4 STI CATEGORIZED RECOMMENDATIONS */}
          {activeTab === 'recommendations' && (
            <div className="space-y-6">
              {isRecommendationsFlagged && (
                <div className="p-4 bg-amber-50/90 border-2 border-amber-300 rounded-xl flex items-start gap-3 shadow-xs">
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1 text-xs">
                    <span className="font-bold text-amber-900 uppercase tracking-wider block mb-1">
                      Reviewer Revision Feedback — STI Recommendations
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
                    STI Institutional Post-Mortem Areas (Verbatim Standard)
                  </h4>
                  <p className="text-xs text-slate-600 mt-1">
                    Complete the four standard STI recommendation categories to provide institutional insights for future campus events.
                  </p>
                </div>
                <AIAssistButton
                  label="Auto-Draft 4 Recommendations"
                  onClick={handleAutoDraft4Recommendations}
                  isLoading={isGeneratingRecs}
                  variant="primary"
                  tooltip="Generate observations and recommendations for Program Flow, Engagement, Tech Setup, and Prep"
                />
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
                      className="w-full bg-[#0E4EBD] hover:bg-[#001A4D] text-white p-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
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
                            className="self-end bg-red-600 hover:bg-red-700 p-1 rounded text-white cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Dynamic Institutional Signatory Pipeline Builder */}
              <PARFlowBuilder
                approvalChain={approvalChain}
                onChange={setApprovalChain}
                activeSignatories={activeSignatories}
                orgId={selectedEvent?.hostingOrgId || currentUser.organizationId}
                orgName={selectedEvent?.hostingOrgName || (isSasAdmin ? 'Student Affairs Services' : undefined)}
                isSasCreator={isSasAdmin || (selectedEvent ? isSasInstitutionalActivity(selectedEvent) : false)}
              />

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
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleSubmitOrDraft(false)}
              className="px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200 bg-slate-100 border border-slate-300 rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              Save Draft
            </button>
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
    </div>
  );
}
