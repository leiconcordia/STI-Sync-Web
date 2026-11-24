import React, { useState, useMemo, useEffect } from 'react';
import { resolveSignatoryLabel } from '../../modules/signatories/utils/signatory-label.utils';
import { resolveSignatoryDecisionCapabilities } from '../../modules/workflow/utils/approver-resolution.utils';
import {
  X,
  FileCheck2,
  FileText,
  Calendar,
  Building,
  MapPin,
  Users,
  DollarSign,
  PenTool,
  Send,
  RotateCcw,
  ShieldCheck,
  CheckCircle2,
  Clock,
  AlertCircle,
  Eye,
  Download,
  ExternalLink,
  Loader2,
  GitCompare,
  BookOpen,
  Wrench,
  Megaphone,
  Camera,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  Paperclip,
  ScanLine,
  Award,
} from 'lucide-react';
import { collection, doc, getDoc, getDocs, limit, onSnapshot, query, where } from 'firebase/firestore';
import { toast } from 'sonner';
import { db } from '../../../services/firebase';
import type { PostActivityReportDocument, PARAttachmentFile } from '../../modules/post-activity-reports/types/par.types';
import { PAR_SECTIONS_FOR_REVISION } from '../../modules/post-activity-reports/types/par.types';
import type { ActivityProposal } from '../../modules/activity-proposals/types/proposal.types';
import type { LiquidationDocument } from '../../modules/finance/types/liquidation.types';
import {
  endorsePARStep,
  returnPAR,
  fetchLinkedActivityProposal,
  PAR_COLLECTION,
} from '../../modules/post-activity-reports/services/par.service';
import { exportPostActivityReportPDF } from '../../modules/post-activity-reports/utils/par-pdf-exporter';
import { resolvePARRemarksDescription } from '../../modules/post-activity-reports/utils/par-remarks.utils';
import { getSasSignatoryConfig } from '../../modules/signatories/services/sas-signatory.service';
import { SAS_ADMINS_COLLECTION } from '../../modules/auth/services/auth.service';
import { formatPersonName } from '../../utils/name.utils';
import { formatCurrency, formatVariance } from '../../utils/currency';
import { formatLongDateTime, formatTextWithLongDates } from '../../utils/date';
import RevisionDiffViewerModal from '../../modules/workflow/components/RevisionDiffViewerModal';
import RevisionFeedbackBanner from '../../modules/workflow/components/RevisionFeedbackBanner';
import InlineRevisionBadge from '../../modules/workflow/components/InlineRevisionBadge';
import { diffPostActivityReport } from '../../modules/workflow/utils/document-diff-engine';
import StepReturnRevisionModal from '../../modules/workflow/components/StepReturnRevisionModal';
import PARAttendanceModal from './PARAttendanceModal';
import PARFinancialReportModal from './PARFinancialReportModal';
import PARDocumentsAndVoucherModal from './PARDocumentsAndVoucherModal';
import { usePARActivityFinancials } from '../../modules/post-activity-reports/hooks/usePARActivityFinancials';
import { PARFinancialTransactionsSection } from '../../modules/post-activity-reports/components/PARFinancialTransactionsSection';
import { hasSignatorySignedStep, hasSignatorySignedDocument } from '../utils/campus-activity-report';
import { peekCachedEventsById } from '../../modules/events/hooks/useEventStream';
import { peekCachedProposalById } from '../../modules/activity-proposals/services/proposal.service';
import {
  peekCachedLiquidationById,
  peekCachedLiquidationByEventId,
} from '../../modules/finance/hooks/useLiquidationStream';

interface PAREndorsementModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: PostActivityReportDocument | null;
  signatorySession: any;
  onOpenSignaturePad: () => void;
  onReportUpdated?: () => void;
  readOnly?: boolean;
}

interface ConsolidatedAttachment {
  id: string;
  name: string;
  url: string;
  category: string;
  fileType?: string;
}

function cleanSigUrl(val?: unknown): string {
  if (typeof val !== 'string') return '';
  const trimmed = val.trim();
  if (!trimmed || trimmed.includes('[base64-')) return '';
  return trimmed;
}

function isImageAttachment(url: string, fileType?: string, name?: string): boolean {
  if (fileType === 'image') return true;
  const target = `${url} ${name || ''}`.toLowerCase();
  if (/^data:image\//.test(url)) return true;
  return /\.(png|jpe?g|webp|gif|bmp|svg)(\?|#|$)/i.test(target);
}

export default function PAREndorsementModal({
  isOpen,
  onClose,
  report,
  signatorySession,
  onOpenSignaturePad,
  onReportUpdated,
  readOnly = false,
}: PAREndorsementModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showReturnDialog, setShowReturnDialog] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showDiffModal, setShowDiffModal] = useState(false);
  const [pendingConfirmType, setPendingConfirmType] = useState<'approve' | 'endorse' | null>(null);

  // Live report & linked comparison documents (AP + FL + Event)
  const [liveReport, setLiveReport] = useState<PostActivityReportDocument | null>(report);
  const [linkedProposal, setLinkedProposal] = useState<ActivityProposal | null>(null);
  const [linkedLiquidation, setLinkedLiquidation] = useState<LiquidationDocument | null>(null);
  const [linkedEvent, setLinkedEvent] = useState<any>(null);
  const [loadingLinkedDocs, setLoadingLinkedDocs] = useState(false);
  const [resolvedMakerSig, setResolvedMakerSig] = useState<{
    name: string;
    roleTitle: string;
    signatureUrl: string;
  }>({ name: '', roleTitle: '', signatureUrl: '' });

  // Dedicated PAR Sub-Modals & Lightbox states
  const [showAttendanceModal, setShowAttendanceModal] = useState(false);
  const [showFinancialModal, setShowFinancialModal] = useState(false);
  const [showDocumentsModal, setShowDocumentsModal] = useState(false);
  const [lightboxState, setLightboxState] = useState<{
    items: Array<{ url: string; caption: string }>;
    index: number;
    zoom: number;
  } | null>(null);

  // Sync liveReport immediately when prop changes
  useEffect(() => {
    setLiveReport(report);
  }, [report]);

  // Real-time Firestore listener for the PAR document itself so newly synced/updated fields & signatures stay fresh
  useEffect(() => {
    if (!isOpen || !report?.id) return;
    const unsub = onSnapshot(
      doc(db, PAR_COLLECTION, report.id),
      (snap) => {
        if (snap.exists()) {
          setLiveReport({ id: snap.id, ...snap.data() } as PostActivityReportDocument);
        }
      },
      (err) => {
        console.warn('[PAREndorsementModal] Live PAR snapshot warning:', err);
      }
    );
    return () => unsub();
  }, [isOpen, report?.id]);

  const activeReport = liveReport || report;

  const activityFinancials = usePARActivityFinancials({
    isOpen,
    report: activeReport,
    preloadedEvent: linkedEvent,
    preloadedProposal: linkedProposal,
    preloadedLiquidation: linkedLiquidation,
  });

  // Hydrate linked Event, Activity Proposal (AP), Financial Liquidation (FL), and Maker signature
  useEffect(() => {
    if (!isOpen || !activeReport?.id) return;
    let cancelled = false;

    const hydrateLinkedRecords = async () => {
      setLoadingLinkedDocs(true);
      try {
        // 1. Fetch Event document (check shared in-memory singleton cache first)
        let eventDoc: any = activeReport.eventId ? peekCachedEventsById(activeReport.eventId) : null;
        if (!eventDoc && activeReport.eventId) {
          for (const colName of ['events', 'activities', 'activity_proposals', 'proposals']) {
            try {
              const snap = await getDoc(doc(db, colName, activeReport.eventId));
              if (snap.exists()) {
                eventDoc = { id: snap.id, ...snap.data() };
                break;
              }
            } catch {}
          }
        }
        if (!cancelled) setLinkedEvent(eventDoc);

        // 2. Fetch Linked Activity Proposal (check shared in-memory cache before querying)
        let proposal: ActivityProposal | null = null;
        const directProposalId = eventDoc?.proposalId || eventDoc?.activityProposalId || activeReport.eventId;
        if (directProposalId) {
          proposal = peekCachedProposalById(directProposalId);
        }
        if (!proposal) {
          try {
            proposal = await fetchLinkedActivityProposal(
              eventDoc || { referenceId: activeReport.eventReferenceId },
              activeReport.eventId
            );
          } catch {}
        }
        if (!proposal && eventDoc && (eventDoc.title || eventDoc.financialProjections || eventDoc.objectives)) {
          proposal = eventDoc as ActivityProposal;
        }
        if (!cancelled) setLinkedProposal(proposal);

        // 3. Fetch Linked Financial Liquidation (check shared in-memory cache first)
        let liquidation: LiquidationDocument | null = null;
        const candidateLiqIds = Array.from(
          new Set(
            [
              activeReport.liquidationId,
              eventDoc?.liquidationReportId,
              eventDoc?.liquidationId,
              (proposal as any)?.liquidationReportId,
              (proposal as any)?.liquidationId,
            ].filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
          )
        );
        for (const liqId of candidateLiqIds) {
          const cachedLiq = peekCachedLiquidationById(liqId);
          if (cachedLiq) {
            liquidation = cachedLiq;
            break;
          }
        }
        if (!liquidation && activeReport.eventId) {
          liquidation = peekCachedLiquidationByEventId(activeReport.eventId);
        }

        if (!liquidation) {
          for (const liqId of candidateLiqIds) {
            for (const colName of ['liquidations', 'financial_liquidations']) {
              try {
                const snap = await getDoc(doc(db, colName, liqId));
                if (snap.exists()) {
                  liquidation = { id: snap.id, ...snap.data() } as LiquidationDocument;
                  break;
                }
              } catch {}
            }
            if (liquidation) break;
          }
        }

        if (!liquidation && activeReport.eventId) {
          for (const colName of ['liquidations', 'financial_liquidations']) {
            try {
              const q = query(collection(db, colName), where('eventId', '==', activeReport.eventId));
              const qSnap = await getDocs(q);
              const docs = qSnap.docs
                .map((d) => ({ id: d.id, ...d.data() } as any))
                .filter((d) => d.isDeleted !== true && d.status !== 'voided');
              if (docs.length > 0) {
                liquidation =
                  docs.find((d) => d.status === 'approved') ||
                  docs.find((d) => d.status === 'under_review') ||
                  docs[0];
                break;
              }
            } catch {}
          }
        }
        if (!cancelled) setLinkedLiquidation(liquidation);

        // 4. Resolve Maker signature fallback if not embedded directly on PAR
        const rAny = activeReport as any;
        let mName =
          activeReport.preparedBy?.name?.trim() ||
          rAny.submittedByName?.trim() ||
          activeReport.createdByName?.trim() ||
          '';
        let mRole =
          activeReport.preparedBy?.roleTitle?.trim() ||
          rAny.submittedByRole?.trim() ||
          (activeReport.creatorRole === 'sas_admin'
            ? 'SAS Administrator'
            : activeReport.creatorRole === 'officer'
            ? 'Organization Officer'
            : 'Organization Adviser');
        let mSig =
          cleanSigUrl(activeReport.preparedBy?.signatureUrl) ||
          cleanSigUrl(activeReport.submittedBySignatureUrl) ||
          cleanSigUrl(rAny.signatureUrl);

        if (!mSig) {
          const orgLower = (activeReport.organizationId || '').toLowerCase();
          const isSas =
            activeReport.creatorRole === 'sas_admin' ||
            Boolean(activeReport.isSasInternal) ||
            orgLower === 'sas' ||
            orgLower === 'sao_admin' ||
            orgLower === 'sao';

          if (isSas) {
            const creatorUid = rAny.submittedByUid || activeReport.createdByUid || '';
            if (creatorUid && creatorUid !== 'sas_admin_user') {
              try {
                const adminSnap = await getDoc(doc(db, SAS_ADMINS_COLLECTION, creatorUid));
                if (adminSnap.exists()) {
                  const d = adminSnap.data();
                  mName = mName || formatPersonName(d) || d.displayName || d.name || '';
                  mRole = d.signatoryRoleTitle || d.position || mRole;
                  mSig = cleanSigUrl(d.signatureUrl) || cleanSigUrl(d.signatureDataUrl);
                }
              } catch {}
            }
            if (!mSig) {
              try {
                const adminsSnap = await getDocs(query(collection(db, SAS_ADMINS_COLLECTION), limit(25)));
                const targetEmail = (activeReport.createdByEmail || '').trim().toLowerCase();
                const match =
                  adminsSnap.docs.find((d) => targetEmail && (d.data().email || '').trim().toLowerCase() === targetEmail) ||
                  adminsSnap.docs.find((d) => Boolean(cleanSigUrl(d.data().signatureUrl || d.data().signatureDataUrl)));
                if (match) {
                  const d = match.data();
                  mName = mName || formatPersonName(d) || d.displayName || d.name || '';
                  mRole = d.signatoryRoleTitle || d.position || mRole;
                  mSig = cleanSigUrl(d.signatureUrl) || cleanSigUrl(d.signatureDataUrl);
                }
              } catch {}
            }
            if (!mSig) {
              try {
                const sasCfg = await getSasSignatoryConfig();
                mName = mName || sasCfg.name || '';
                mRole = sasCfg.roleTitle || mRole;
                mSig = cleanSigUrl(sasCfg.signatureUrl) || cleanSigUrl(sasCfg.signatureDataUrl);
              } catch {}
            }
          } else if (proposal) {
            mName = mName || proposal.preparedBy?.name || '';
            mSig = cleanSigUrl(proposal.preparedBy?.signatureUrl) || cleanSigUrl((proposal as any).submittedBySignatureUrl);
          }
        }

        if (!cancelled) {
          setResolvedMakerSig({
            name: mName || 'Activity Organizer',
            roleTitle: mRole || 'Author',
            signatureUrl: mSig,
          });
        }
      } finally {
        if (!cancelled) setLoadingLinkedDocs(false);
      }
    };

    hydrateLinkedRecords();
    return () => {
      cancelled = true;
    };
  }, [isOpen, activeReport?.id, activeReport?.eventId, activeReport?.liquidationId]);

  // Compute latest snapshot and differences if report was revised
  const latestSnapshot = useMemo(() => {
    const history = activeReport?.revisionHistory || [];
    if (history.length > 0) {
      for (let i = history.length - 1; i >= 0; i--) {
        const item = history[i];
        const snap =
          (item as any)?.dataSnapshot ||
          (item as any)?.previousSnapshot ||
          (item as any)?.snapshot ||
          (item as any)?.returnedSnapshot;
        if (snap && (snap.attendanceSummary || snap.results || !(activeReport as any)?.previousSnapshot)) {
          return snap;
        }
      }
    }
    return (
      (activeReport as any)?.previousSnapshot ||
      (activeReport as any)?.returnedSnapshot ||
      (activeReport as any)?.initialSnapshot ||
      (history.length > 0 ? (history[history.length - 1] as any)?.dataSnapshot : null) ||
      null
    );
  }, [activeReport]);

  const parDiffs = useMemo(() => {
    if (!activeReport || !latestSnapshot) return [];
    return diffPostActivityReport(latestSnapshot, activeReport);
  }, [activeReport, latestSnapshot]);

  const diffByPath = useMemo(() => {
    const map = new Map<string, any>();
    for (const d of parDiffs) {
      map.set(d.fieldPath, d);
    }
    return map;
  }, [parDiffs]);

  const hasRevisions = Boolean(
    (activeReport?.version && activeReport.version > 1) ||
    (activeReport?.revisionCount && activeReport.revisionCount > 1) ||
    (activeReport?.revisionHistory && activeReport.revisionHistory.length > 0) ||
    Boolean((activeReport as any)?.previousSnapshot) ||
    Boolean((activeReport as any)?.returnedSnapshot) ||
    activeReport?.status === 'returned'
  );

  if (!isOpen || !activeReport) return null;

  const hasSignature = Boolean(signatorySession?.signatureUrl);
  const activeSignatureUrl = signatorySession?.signatureUrl;

  const chain = activeReport.approvalChain || [];
  const myStepIndex = chain.findIndex((s) => {
    if (s.signatoryUid && (s.signatoryUid === signatorySession?.id || s.signatoryUid === signatorySession?.uid)) return true;
    if (s.signatoryEmail && s.signatoryEmail.toLowerCase() === (signatorySession?.email || '').toLowerCase()) return true;
    if (s.role && signatorySession?.role && s.role.toLowerCase() === signatorySession.role.toLowerCase()) return true;
    if (s.roleTitle && signatorySession?.roleTitle) {
      const sT = s.roleTitle.toLowerCase();
      const uT = signatorySession.roleTitle.toLowerCase();
      if (sT === uT || sT.includes(uT) || uT.includes(sT)) return true;
    }
    return false;
  });

  const myStep = myStepIndex >= 0 ? chain[myStepIndex] : chain.find((s) => s.status === 'current');

  const isReturnedDoc = activeReport.status === 'returned' || activeReport.status === 'rejected';
  const isPARApproved = activeReport.status === 'approved';
  const alreadySignedByMe =
    !isReturnedDoc &&
    (chain.some((s) => hasSignatorySignedStep(s, signatorySession)) ||
      hasSignatorySignedDocument(activeReport, signatorySession));

  const currentStage = activeReport.currentStageIndex ?? 1;
  const isMyStepUnsigned = Boolean(
    myStepIndex >= 0 &&
      myStep &&
      myStep.status !== 'endorsed' &&
      myStep.status !== 'approved' &&
      myStep.status !== 'waived' &&
      myStep.status !== 'returned' &&
      myStep.status !== 'returned_for_revision' &&
      myStep.status !== 'rejected' &&
      (isPARApproved || !myStep.stageIndex || myStep.stageIndex === currentStage)
  );

  const canSignNow = !readOnly && !alreadySignedByMe && !isReturnedDoc && isMyStepUnsigned;
  const isReadOnlyLocked = !canSignNow;
  const canReturnNow = canSignNow && !isPARApproved;

  // Unified Runtime Single-Approval Governance capabilities
  const decisionCaps = resolveSignatoryDecisionCapabilities({
    chain,
    myStepIndex,
    signatory: signatorySession,
    docType: 'par',
  });
  const canApprove = decisionCaps.canApprove;
  const canEndorseInsteadOfApprove = decisionCaps.canEndorseInsteadOfApprove;
  const isDemotedToEndorserOnly = decisionCaps.isDemotedToEndorserOnly;

  const handleEndorse = async (decision: 'approve' | 'forward' = 'forward') => {
    if (isReadOnlyLocked) {
      toast.info('This report is read-only for your account.');
      return;
    }
    if (!hasSignature) {
      toast.error('Please register your electronic signature before endorsing this report.');
      onOpenSignaturePad();
      return;
    }

    const action = decision === 'approve' ? 'approve' : 'endorse';

    setIsSubmitting(true);
    try {
      const result = await endorsePARStep(
        activeReport.id,
        {
          uid: signatorySession?.id || signatorySession?.uid,
          id: signatorySession?.id || signatorySession?.uid,
          name: signatorySession?.name || '',
          email: signatorySession?.email || '',
          roleTitle: signatorySession?.roleTitle || '',
          role: signatorySession?.role || '',
          actionType: action,
          signatureUrl: activeSignatureUrl,
          canApprovePar: signatorySession?.canApprovePar,
          approvalDecision: decision,
        },
        '',
        decision
      );

      if (result.wasCoercedByPriorApproval) {
        toast.info(
          `Already approved by ${result.approvedBySignatoryName || 'another Approver'}. Your signature was recorded as Noted by:.`
        );
      } else if (result.isFullyApproved) {
        toast.success(`Post-Activity Report cleared & approved! Automatically archived to EDMS.`);
      } else if (result.stageAdvanced) {
        toast.success(`Endorsement recorded! Advanced to the next institutional clearance stage.`);
      } else {
        toast.success(`Endorsement recorded successfully.`);
      }

      if (onReportUpdated) onReportUpdated();
      onClose();
    } catch (err: any) {
      console.error('[PAREndorsementModal] Error endorsing:', err);
      toast.error(err?.message || 'Failed to endorse report.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReturn = async (data: {
    overallRemarks: string;
    flaggedSteps: string[];
    stepRemarks: Record<string, string>;
    revisionDeadline: string;
  }) => {
    setIsSubmitting(true);
    try {
      await returnPAR(
        activeReport.id,
        signatorySession?.id || signatorySession?.uid || '',
        signatorySession?.name || 'Signatory',
        data.overallRemarks,
        signatorySession?.roleTitle || 'Institutional Signatory',
        signatorySession?.email || undefined,
        data.stepRemarks,
        data.flaggedSteps,
        data.revisionDeadline
      );
      toast.success('Post-Activity Report returned to organizer with section-level revision notes.');
      if (onReportUpdated) onReportUpdated();
      setShowReturnDialog(false);
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to return report.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownloadPdf = async () => {
    setIsExporting(true);
    try {
      await exportPostActivityReportPDF(activeReport);
      toast.success(`Official Post-Activity Report PDF downloaded.`);
    } catch (err: any) {
      toast.error('Failed to export PDF: ' + (err?.message || 'Error'));
    } finally {
      setIsExporting(false);
    }
  };

  // Normalized / Hydrated PAR Fields with AP & FL fallbacks
  const lp: any = linkedProposal;
  const le: any = linkedEvent;
  const ll: any = linkedLiquidation;

  const effectiveTitle = activeReport.eventTitle || lp?.title || le?.title || 'Post-Activity Report';
  const effectiveDescription = activeReport.eventDescription || lp?.description || le?.description || '';
  const effectiveOrganizers =
    Array.isArray(activeReport.proposalOrganizers) && activeReport.proposalOrganizers.length > 0
      ? activeReport.proposalOrganizers
      : Array.isArray(lp?.organizers) && lp.organizers.length > 0
      ? lp.organizers
      : [activeReport.organizerName || activeReport.organizationName].filter(Boolean);
  const effectiveDate = formatTextWithLongDates(
    activeReport.eventDateFormatted ||
      lp?.proposedDate ||
      (le?.date ? `${le.date}${le.startTime ? `, ${le.startTime}${le.endTime ? ` – ${le.endTime}` : ''}` : ''}` : ''),
    'Not specified'
  );
  const effectiveVenue =
    activeReport.eventVenue || lp?.venueName || lp?.venue || le?.venueName || le?.venue || 'Not specified';

  const effectiveObjectives: string[] =
    Array.isArray(activeReport.proposalObjectives) && activeReport.proposalObjectives.length > 0
      ? activeReport.proposalObjectives
      : Array.isArray(lp?.objectives)
      ? lp.objectives
      : [];
  const effectiveSuccessIndicators: string[] =
    Array.isArray(activeReport.proposalSuccessIndicators) && activeReport.proposalSuccessIndicators.length > 0
      ? activeReport.proposalSuccessIndicators
      : Array.isArray(lp?.successIndicators)
      ? lp.successIndicators
      : [];
  const effectiveProposedMechanics: string[] =
    Array.isArray(activeReport.proposedMechanics) && activeReport.proposedMechanics.length > 0
      ? activeReport.proposedMechanics
      : Array.isArray(lp?.mechanics)
      ? lp.mechanics
      : [];
  const trimmedActualMechanics = (activeReport.actualMechanics || '').trim();
  const didMechanicsDiffer =
    typeof activeReport.mechanicsDiffered === 'boolean'
      ? activeReport.mechanicsDiffered
      : Boolean(
          trimmedActualMechanics &&
            trimmedActualMechanics.toLowerCase() !== 'same as proposed.' &&
            trimmedActualMechanics !== effectiveProposedMechanics.join('\n').trim()
        );

  const effectiveMaterials: string[] =
    Array.isArray(activeReport.proposalMaterials) && activeReport.proposalMaterials.length > 0
      ? activeReport.proposalMaterials
      : Array.isArray(activeReport.materialsUtilized) && activeReport.materialsUtilized.length > 0
      ? activeReport.materialsUtilized
      : Array.isArray(lp?.materials)
      ? lp.materials
      : [];
  const effectiveMarketing: string[] =
    Array.isArray(activeReport.proposalMarketingPlan) && activeReport.proposalMarketingPlan.length > 0
      ? activeReport.proposalMarketingPlan
      : Array.isArray(activeReport.marketingConducted) && activeReport.marketingConducted.length > 0
      ? activeReport.marketingConducted
      : Array.isArray(lp?.marketingPlan)
      ? lp.marketingPlan
      : [];
  const effectiveDocPlan: string[] =
    Array.isArray(activeReport.proposalDocumentationPlan) && activeReport.proposalDocumentationPlan.length > 0
      ? activeReport.proposalDocumentationPlan
      : Array.isArray(lp?.documentationPlan)
      ? lp.documentationPlan
      : [];

  const effectiveEstimatedNum = Number(
    activeReport.attendanceSummary?.estimatedAttendance ??
      activeReport.attendanceSummary?.registeredCount ??
      lp?.estAttendanceCount ??
      (typeof lp?.estimatedAttendance === 'number' ? lp.estimatedAttendance : 0)
  );
  const effectiveEstimatedDisplay =
    (activeReport.attendanceSummary as any)?.estimatedAttendanceLabel ||
    (effectiveEstimatedNum > 0 ? effectiveEstimatedNum.toLocaleString() : lp?.estimatedAttendance || '0');
  const effectiveAttendedCount = Number(activeReport.attendanceSummary?.attendedCount || 0);
  const effectiveTurnoutRate =
    activeReport.attendanceSummary?.turnoutRate !== undefined
      ? activeReport.attendanceSummary.turnoutRate
      : effectiveEstimatedNum > 0
      ? Math.round((effectiveAttendedCount / effectiveEstimatedNum) * 100)
      : undefined;
  const effectiveTargetMarket =
    activeReport.attendanceSummary?.targetAudience || lp?.targetMarket || 'Enrolled Students';
  const effectiveWhoAttended =
    activeReport.attendanceSummary?.whoAttended || activeReport.attendanceSummary?.targetAudience || 'College / SHS Students';

  const totalRevenue = Number(
    activeReport.financialSummary?.totalRevenue ??
      ll?.allocatedBudget ??
      ll?.totalRevenue ??
      lp?.financialProjections?.totalEstimatedRevenue ??
      0
  );
  const totalDisbursed = Number(
    activeReport.financialSummary?.totalDisbursed ??
      ll?.totalActualSpending ??
      0
  );
  const netBalance = totalRevenue - totalDisbursed;

  const effectiveLineItems: Array<{ description: string; unitAmount: number; totalAmount: number }> =
    Array.isArray(activeReport.financialSummary?.lineItems) && activeReport.financialSummary.lineItems.length > 0
      ? activeReport.financialSummary.lineItems
      : Array.isArray(ll?.lineItems)
      ? ll.lineItems.map((li: any) => ({
          description: li.description || li.category || 'Expense Item',
          unitAmount: Number(li.unitCost || 0),
          totalAmount: Number(li.totalCost || 0),
        }))
      : [];

  // Consolidate EVERY uploaded document attached across the PAR fields
  const consolidatedAttachments: ConsolidatedAttachment[] = [];
  const seenUrls = new Set<string>();
  const pushAttachment = (item: ConsolidatedAttachment) => {
    if (!item.url || seenUrls.has(item.url)) return;
    seenUrls.add(item.url);
    consolidatedAttachments.push(item);
  };

  if (activeReport.mechanicsAttachmentUrl) {
    pushAttachment({
      id: 'att-mechanics',
      name: activeReport.mechanicsAttachmentName || 'Actual Mechanics Sheet',
      url: activeReport.mechanicsAttachmentUrl,
      category: 'Mechanics Sheet',
    });
  }
  if (activeReport.attendanceSummary?.attendanceListUrl) {
    pushAttachment({
      id: 'att-attendance',
      name: activeReport.attendanceSummary.attendanceListName || 'Attendance List / Sheet',
      url: activeReport.attendanceSummary.attendanceListUrl,
      category: 'Attendance Sheet',
    });
  }
  if (activeReport.evaluationSummaryUrl) {
    pushAttachment({
      id: 'att-evaluation',
      name: 'Feedback / Evaluation Summary',
      url: activeReport.evaluationSummaryUrl,
      category: 'Evaluation Summary',
    });
  }
  (activeReport.financialSummary?.attachments || []).forEach((f: PARAttachmentFile, idx: number) => {
    pushAttachment({
      id: f.id || `att-fin-${idx}`,
      name: f.name || `Financial Attachment ${idx + 1}`,
      url: f.url,
      category: 'Financial Attachment',
      fileType: f.fileType,
    });
  });
  (activeReport.supportingDocuments || []).forEach((f: PARAttachmentFile, idx: number) => {
    pushAttachment({
      id: f.id || `att-sup-${idx}`,
      name: f.name || `Supporting Document ${idx + 1}`,
      url: f.url,
      category: 'Supporting Document',
      fileType: f.fileType,
    });
  });

  // Include Financial Liquidation Proofs directly so Signatories see Voucher, Settlement Proofs & Receipts
  const voucherAttachment = (ll as any)?.disbursementVoucher || (ll as any)?.voucher || null;
  if (voucherAttachment?.fileUrl) {
    pushAttachment({
      id: 'att-fl-voucher',
      name: voucherAttachment.fileName || 'Official Disbursement Voucher',
      url: voucherAttachment.fileUrl,
      category: 'FL Disbursement Voucher',
      fileType: voucherAttachment.fileType,
    });
  }
  const isDeficitLiquidation = Number(ll?.surplusOrDeficit ?? 0) < -0.009;
  (ll?.cashierSettlementProofs || []).forEach((p: any, idx: number) => {
    if (!p?.url) return;
    pushAttachment({
      id: p.id || `att-fl-settlement-${idx}`,
      name: p.name || `${isDeficitLiquidation ? 'Reimbursement Proof' : 'Cashier Return Receipt'} #${idx + 1}`,
      url: p.url,
      category: isDeficitLiquidation ? 'FL Reimbursement Proof' : 'FL Cashier Return Receipt',
      fileType: p.fileType,
    });
  });
  activityFinancials.lineItemReceipts.forEach((rec) => {
    pushAttachment({
      id: rec.id,
      name: rec.name,
      url: rec.url,
      category: rec.isLostReceipt
        ? `FL Lost Receipt Affidavit (${rec.itemDescription || 'Item'})`
        : `FL Official Receipt (${rec.itemDescription || 'Item'})`,
      fileType: rec.fileType,
    });
  });

  const isExemptFromFL =
    (activeReport as any).fundingSource === 'zero_budget' ||
    lp?.fundingSource === 'zero_budget' ||
    (totalRevenue === 0 && totalDisbursed === 0 && !linkedLiquidation && !activeReport.liquidationId);

  const photosList = activeReport.photos || [];
  const totalAttachedDocsCount = consolidatedAttachments.length;

  const resultSubsections: Array<{ num: string; title: string; value?: string; fallback?: string }> = [
    { num: '3.', title: 'Enrichment of Learning Beyond the Classroom', value: activeReport.results?.classroomEnrichment },
    { num: '4.', title: 'Reason for Venue Selection', value: activeReport.results?.venueAssessment },
    { num: '5.', title: 'Food / Logistics Assessment', value: activeReport.results?.foodAssessment || activeReport.results?.logisticsAssessment },
    { num: '6.', title: 'Schedule Compliance', value: activeReport.results?.scheduleCompliance },
    { num: '7.', title: 'Issues / Problems Encountered and Actions Taken', value: activeReport.results?.issuesEncountered, fallback: 'No major issues encountered.' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden my-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#001A4D] via-[#0E4EBD] to-[#1E70E8] p-4 sm:p-5 text-white flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 shrink-0">
              <FileCheck2 className="w-6 h-6 text-[#FFD41C]" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-bold tracking-widest uppercase bg-white/20 px-2 py-0.5 rounded-full text-white">
                  Institutional Endorsement
                </span>
                <span className="text-xs text-blue-200 font-mono font-bold">
                  {activeReport.referenceNo}
                </span>
                {hasRevisions && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-200 border border-amber-400/40">
                    Revision v{activeReport.version || 2}.0
                  </span>
                )}
              </div>
              <h2 className="text-base sm:text-lg font-black tracking-tight text-white mt-0.5 truncate">
                {effectiveTitle}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {loadingLinkedDocs && (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-blue-100 bg-white/10 px-2.5 py-1 rounded-xl border border-white/15">
                <Loader2 className="w-3 h-3 animate-spin" /> Syncing records...
              </span>
            )}
            {hasRevisions && (
              <button
                type="button"
                onClick={() => setShowDiffModal(true)}
                className="px-3 py-1.5 rounded-xl bg-amber-400 text-slate-950 hover:bg-amber-300 font-bold text-xs flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                title="Compare what was revised in this Post-Activity Report"
              >
                <GitCompare className="w-3.5 h-3.5" />
                <span>Compare Changes</span>
                {parDiffs.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 rounded-full bg-slate-900 text-amber-300 text-[10px] font-black">
                    {parDiffs.length}
                  </span>
                )}
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 bg-slate-50/40">
          {/* Revision Banner if report has past revision history */}
          {hasRevisions && (
            <RevisionFeedbackBanner
              returnedBy={{
                name: (activeReport as any).returnedByName || (activeReport as any).returnedBy || 'Institutional Signatory',
                roleTitle: (activeReport as any).returnedByRoleTitle || 'Signatory Reviewer',
                email: (activeReport as any).returnedByEmail,
              }}
              returnedAt={activeReport.returnedAt}
              returnRemarks={activeReport.returnRemarks}
              revisionHistory={activeReport.revisionHistory}
              versionLabel={activeReport.version ? `v${activeReport.version}.0` : undefined}
              documentTitle={effectiveTitle}
              documentType="PAR"
              currentDocument={activeReport}
              previousSnapshot={latestSnapshot}
            />
          )}

          {/* Key Facts Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white p-4 rounded-xl border border-slate-200 text-xs shadow-2xs">
            <div>
              <span className="text-slate-400 block font-medium mb-0.5">Hosting Body</span>
              <strong className="text-slate-900 font-bold flex items-center gap-1.5">
                <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>{activeReport.organizationName || '—'}</span>
              </strong>
            </div>
            <div>
              <span className="text-slate-400 block font-medium mb-0.5">Date &amp; Time</span>
              <strong className="text-slate-900 font-bold flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>{effectiveDate}</span>
              </strong>
            </div>
            <div>
              <span className="text-slate-400 block font-medium mb-0.5">Venue</span>
              <strong className="text-slate-900 font-bold flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>{effectiveVenue}</span>
              </strong>
            </div>
            <div>
              <span className="text-slate-400 block font-medium mb-0.5">Academic Term / Liquidation</span>
              <strong className="text-emerald-700 font-bold block">
                {activeReport.liquidationRefNumber || ll?.referenceNumber || (isExemptFromFL ? 'Exempt' : 'Cleared')}
              </strong>
              {(activeReport.schoolYear || activeReport.semester) && (
                <span className="text-[11px] text-slate-500">
                  {[activeReport.schoolYear, activeReport.semester].filter(Boolean).join(' • ')}
                </span>
              )}
            </div>
          </div>

          {/* Activity Details, Mechanics, Materials, Marketing & Documentation */}
          <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-2xs space-y-4 text-xs">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-[#0E4EBD]" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Activity Details &amp; Execution Fidelity
                </h4>
              </div>
              {effectiveOrganizers.length > 0 && (
                <span className="text-[11px] text-slate-600 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                  <strong>Organizer/s:</strong> {effectiveOrganizers.join(', ')}
                </span>
              )}
            </div>

            {effectiveDescription && (
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200/80">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  Description
                </span>
                <p className="text-slate-700 leading-relaxed whitespace-pre-line">{effectiveDescription}</p>
              </div>
            )}

            {/* Proposed Objectives & Success Indicators from Proposal */}
            {(effectiveObjectives.length > 0 || effectiveSuccessIndicators.length > 0) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {effectiveObjectives.length > 0 && (
                  <div className="bg-blue-50/50 p-3 rounded-lg border border-blue-100">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#001A4D] block mb-1.5">
                      Proposed Objectives ({effectiveObjectives.length})
                    </span>
                    <ul className="space-y-1 text-slate-700">
                      {effectiveObjectives.map((obj, idx) => (
                        <li key={idx} className="flex items-start gap-1.5">
                          <span className="text-[#0E4EBD] font-bold">{idx + 1}.</span>
                          <span>{obj}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {effectiveSuccessIndicators.length > 0 && (
                  <div className="bg-indigo-50/50 p-3 rounded-lg border border-indigo-100">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-900 block mb-1.5">
                      Success Indicators ({effectiveSuccessIndicators.length})
                    </span>
                    <ul className="space-y-1 text-slate-700">
                      {effectiveSuccessIndicators.map((ind, idx) => (
                        <li key={idx} className="flex items-start gap-1.5">
                          <span className="text-indigo-600 font-bold">•</span>
                          <span>{ind}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Mechanics Comparison */}
            <div className={`p-3 rounded-lg border ${didMechanicsDiffer ? 'bg-amber-50/60 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
              <div className="flex items-center justify-between flex-wrap gap-2 mb-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <Wrench className="w-3.5 h-3.5 text-slate-500" />
                  Mechanics
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    didMechanicsDiffer
                      ? 'bg-amber-100 text-amber-800 border-amber-300'
                      : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                  }`}
                >
                  {didMechanicsDiffer ? 'Actual Mechanics Differed from Proposal' : 'Same as Proposed'}
                </span>
              </div>

              {didMechanicsDiffer ? (
                <div className="space-y-2">
                  <div>
                    <span className="text-[11px] font-semibold text-amber-900 block">Actual Mechanics Executed:</span>
                    <p className="text-slate-800 whitespace-pre-line mt-0.5">
                      {trimmedActualMechanics || 'See attached mechanics sheet.'}
                    </p>
                  </div>
                  {activeReport.mechanicsAttachmentUrl && (
                    <a
                      href={activeReport.mechanicsAttachmentUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white hover:bg-amber-100/60 text-amber-900 border border-amber-300 font-semibold"
                    >
                      <Paperclip className="w-3.5 h-3.5" />
                      <span>{activeReport.mechanicsAttachmentName || 'Attached Mechanics Sheet'}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  {effectiveProposedMechanics.length > 0 && (
                    <div className="pt-2 border-t border-amber-200/70">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                        Original Proposed Mechanics (from AP):
                      </span>
                      <ul className="list-disc list-inside text-[11px] text-slate-600 space-y-0.5">
                        {effectiveProposedMechanics.map((m, idx) => (
                          <li key={idx}>{m}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-1.5">
                  <p className="text-emerald-800 font-medium">Same as proposed.</p>
                  {effectiveProposedMechanics.length > 0 && (
                    <ul className="list-disc list-inside text-[11px] text-slate-600 space-y-0.5">
                      {effectiveProposedMechanics.map((m, idx) => (
                        <li key={idx}>{m}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            {/* Materials, Marketing & Documentation Plan */}
            {(effectiveMaterials.length > 0 || effectiveMarketing.length > 0 || effectiveDocPlan.length > 0) && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                    Materials
                  </span>
                  <p className="text-slate-700">{effectiveMaterials.length > 0 ? effectiveMaterials.join(', ') : '—'}</p>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1 mb-1">
                    <Megaphone className="w-3 h-3" /> Marketing
                  </span>
                  <p className="text-slate-700">{effectiveMarketing.length > 0 ? effectiveMarketing.join(', ') : '—'}</p>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1 mb-1">
                    <Camera className="w-3 h-3" /> Documentation Plan
                  </span>
                  <p className="text-slate-700">{effectiveDocPlan.length > 0 ? effectiveDocPlan.join(', ') : '—'}</p>
                </div>
              </div>
            )}
          </div>

          {/* Verification Cards: Attendance & Financial Summary */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Attendance */}
            <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-2xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-blue-600" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                      Attendance
                    </h4>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      activeReport.attendanceSummary?.attendanceMonitoringUsed
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-slate-100 text-slate-600 border-slate-200'
                    }`}
                  >
                    <ScanLine className="w-3 h-3" />
                    {activeReport.attendanceSummary?.attendanceMonitoringUsed
                      ? 'Attendance Monitoring Verified'
                      : 'Manual / Headcount Entry'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2.5 text-center mb-3">
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-500 block">Estimated Attendance (AP)</span>
                    <div className="flex items-center justify-center gap-1.5 mt-0.5">
                      <span className="text-base font-bold text-slate-800">{effectiveEstimatedDisplay}</span>
                      {diffByPath.get('attendanceSummary.registeredCount') && (
                        <InlineRevisionBadge diff={diffByPath.get('attendanceSummary.registeredCount')} />
                      )}
                    </div>
                  </div>
                  <div className="bg-blue-50 p-2.5 rounded-lg border border-blue-200">
                    <span className="text-[10px] text-blue-700 block font-medium">How many attended?</span>
                    <div className="flex items-center justify-center gap-1.5 mt-0.5">
                      <span className="text-base font-bold text-blue-800">{effectiveAttendedCount}</span>
                      {effectiveTurnoutRate !== undefined && (
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-300">
                          {effectiveTurnoutRate}%
                        </span>
                      )}
                      {diffByPath.get('attendanceSummary.attendedCount') && (
                        <InlineRevisionBadge diff={diffByPath.get('attendanceSummary.attendedCount')} />
                      )}
                    </div>
                  </div>
                </div>

                <div className="text-xs text-slate-600 space-y-1.5">
                  {activeReport.attendanceSummary?.howManyAttended && (
                    <p>
                      <strong>Reported Turnout:</strong> {activeReport.attendanceSummary.howManyAttended}
                    </p>
                  )}
                  <p>
                    <strong>Target Market (Proposal):</strong> {effectiveTargetMarket}
                  </p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span>
                      <strong>Who attended?:</strong> {effectiveWhoAttended}
                    </span>
                    {diffByPath.get('attendanceSummary.whoAttended') && (
                      <InlineRevisionBadge diff={diffByPath.get('attendanceSummary.whoAttended')} />
                    )}
                  </div>
                </div>
              </div>

              {(activeReport.attendanceSummary?.attendanceMonitoringUsed ||
                activeReport.attendanceSummary?.attendanceListUrl) && (
                <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
                  {activeReport.attendanceSummary?.attendanceMonitoringUsed && (
                    <button
                      type="button"
                      onClick={() => setShowAttendanceModal(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#001A4D] hover:bg-[#0E4EBD] text-white text-xs font-bold transition-colors cursor-pointer"
                    >
                      <ScanLine className="w-3.5 h-3.5 text-[#FFD41C]" />
                      <span>View Attendance Logs</span>
                    </button>
                  )}
                  {activeReport.attendanceSummary?.attendanceListUrl && (
                    <a
                      href={activeReport.attendanceSummary.attendanceListUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-[#001A4D] border border-blue-200 text-xs font-semibold transition-colors"
                    >
                      <Download className="w-3.5 h-3.5 text-[#0E4EBD]" />
                      <span>{activeReport.attendanceSummary.attendanceListName || 'View Attendance Sheet'}</span>
                      <ExternalLink className="w-3 h-3 text-[#0E4EBD]" />
                    </a>
                  )}
                </div>
              )}
            </div>

            {/* Financial Report, Anticipated vs. Actual & Activity Transactions */}
            <div className="space-y-3">
              <PARFinancialTransactionsSection
                anticipatedExpenses={activityFinancials.anticipatedExpenses}
                anticipatedLineItems={activityFinancials.anticipatedLineItems}
                disbursedBudget={activityFinancials.disbursedBudget || totalRevenue}
                actualSpent={activityFinancials.actualSpent || totalDisbursed}
                variance={
                  linkedLiquidation
                    ? activityFinancials.variance
                    : totalRevenue - totalDisbursed
                }
                linkedLiquidation={linkedLiquidation}
                copiedFromLiquidation={activeReport.financialSummary?.copiedFromLiquidation}
                sourceAllocations={activityFinancials.sourceAllocations}
                surplusReturnAllocations={activityFinancials.surplusReturnAllocations}
                deficitDeductionAllocations={activityFinancials.deficitDeductionAllocations}
                ledgerTransactions={activityFinancials.ledgerTransactions}
                voucher={activityFinancials.voucher}
                lineItemReceipts={activityFinancials.lineItemReceipts}
                settlementProofs={activityFinancials.settlementProofs}
                loading={activityFinancials.loading}
                onOpenFinancialModal={() => setShowFinancialModal(true)}
                onOpenDocumentsModal={() => setShowDocumentsModal(true)}
              />

              {/* Itemized Financial Report Table matching updated PAR */}
              <div className="border border-slate-200 rounded-xl p-3 bg-white shadow-2xs space-y-2">
                <div className="border border-slate-200 rounded-lg overflow-hidden text-[11px]">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                      <tr>
                        <th className="px-2.5 py-1.5">Description</th>
                        <th className="px-2.5 py-1.5 text-right">Unit Amount</th>
                        <th className="px-2.5 py-1.5 text-right">Total Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      <tr className="bg-slate-50/70 font-semibold text-slate-800">
                        <td className="px-2.5 py-1.5">Disbursed / Revenue</td>
                        <td className="px-2.5 py-1.5 text-right">—</td>
                        <td className="px-2.5 py-1.5 text-right">{formatCurrency(totalRevenue)}</td>
                      </tr>
                      {effectiveLineItems.length > 0 ? (
                        effectiveLineItems.map((li, idx) => (
                          <tr key={idx} className="text-slate-700">
                            <td className="px-2.5 py-1.5">{li.description || `Expense Item ${idx + 1}`}</td>
                            <td className="px-2.5 py-1.5 text-right">
                              {li.unitAmount ? formatCurrency(li.unitAmount) : '—'}
                            </td>
                            <td className="px-2.5 py-1.5 text-right font-medium">
                              {formatCurrency(li.totalAmount || 0)}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr className="text-slate-600">
                          <td className="px-2.5 py-1.5">Total Expenses</td>
                          <td className="px-2.5 py-1.5 text-right">—</td>
                          <td className="px-2.5 py-1.5 text-right font-medium">{formatCurrency(totalDisbursed)}</td>
                        </tr>
                      )}
                      <tr className="bg-slate-50 font-bold text-slate-900">
                        <td className="px-2.5 py-1.5">TOTAL EXPENSES SPENT</td>
                        <td className="px-2.5 py-1.5 text-right" />
                        <td className="px-2.5 py-1.5 text-right">{formatCurrency(totalDisbursed)}</td>
                      </tr>
                      <tr className={`${netBalance >= 0 ? 'bg-emerald-50/70 text-emerald-900' : 'bg-rose-50/70 text-rose-900'} font-bold`}>
                        <td className="px-2.5 py-1.5">Balance (Disbursed less Spent)</td>
                        <td className="px-2.5 py-1.5 text-right" />
                        <td className="px-2.5 py-1.5 text-right">{formatVariance(netBalance)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {activeReport.financialSummary?.attachments && activeReport.financialSummary.attachments.length > 0 && (
                  <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-1.5">
                    {activeReport.financialSummary.attachments.map((file, idx) => (
                      <a
                        key={file.id || idx}
                        href={file.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-[11px] font-semibold"
                      >
                        <Paperclip className="w-3 h-3" />
                        <span className="truncate max-w-[160px]">{file.name}</span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Results of the Activity (All 7 updated STI PAR subsections + Per-Objective Assessments) */}
          <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-2xs space-y-3.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
                <Award className="w-4 h-4 text-[#0E4EBD]" />
                Results of the Activity
              </h4>
            </div>

            {/* 1. Achievement of Objectives */}
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900">1. Achievement of Objectives</span>
                {diffByPath.get('results.achievementNarrative') && (
                  <InlineRevisionBadge diff={diffByPath.get('results.achievementNarrative')} />
                )}
              </div>
              <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">
                {activeReport.results?.achievementNarrative || 'No achievement narrative provided.'}
              </p>

              {activeReport.results?.objectiveAssessments && activeReport.results.objectiveAssessments.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-slate-200/80">
                  <span className="text-[11px] font-bold text-slate-600 block">Per-Objective &amp; KPI Breakdown:</span>
                  {activeReport.results.objectiveAssessments.map((oa: any, idx: number) => (
                    <div
                      key={oa.id || idx}
                      className="p-2.5 bg-white rounded-lg border border-slate-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div className="space-y-0.5 min-w-0">
                        <div className="font-semibold text-slate-800">{oa.objectiveText || oa.objective}</div>
                        {oa.successIndicatorText && (
                          <div className="text-[11px] text-slate-500">
                            <span className="font-medium">Target KPI:</span> {oa.successIndicatorText}
                          </div>
                        )}
                        {oa.actualResult && (
                          <div className="text-[11px] text-slate-600">
                            <span className="font-medium text-slate-500">Actual Result:</span> {oa.actualResult}
                          </div>
                        )}
                        {oa.varianceRemarks && (
                          <div className="text-[11px] text-amber-700">
                            <span className="font-medium">Variance Note:</span> {oa.varianceRemarks}
                          </div>
                        )}
                      </div>
                      <span
                        className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0 border ${
                          oa.status === 'fully_achieved'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                            : oa.status === 'partially_achieved'
                            ? 'bg-amber-50 text-amber-700 border-amber-300'
                            : 'bg-rose-50 text-rose-700 border-rose-300'
                        }`}
                      >
                        {String(oa.status || '').replace('_', ' ')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 2. Key Learnings */}
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1.5">
              <span className="text-xs font-bold text-slate-900 block">2. Key Learnings / Insights Gained</span>
              {activeReport.results?.keyLearnings && activeReport.results.keyLearnings.length > 0 ? (
                <ul className="space-y-1 text-xs text-slate-700">
                  {activeReport.results.keyLearnings.map((k, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-blue-600 font-bold">•</span>
                      <span>{k}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-slate-400 italic">No key learnings recorded.</p>
              )}
            </div>

            {/* 3 - 7. Classroom Enrichment, Venue, Food/Logistics, Schedule Compliance, Issues */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              {resultSubsections.map((sub) => (
                <div
                  key={sub.num}
                  className={`bg-slate-50 p-3 rounded-lg border border-slate-200 ${sub.num === '7.' ? 'md:col-span-2' : ''}`}
                >
                  <span className="font-bold text-slate-900 block mb-1">
                    {sub.num} {sub.title}
                  </span>
                  <p className="text-slate-700 leading-relaxed whitespace-pre-line">
                    {sub.value?.trim() || sub.fallback || '—'}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Remarks (For Future Activity Improvements) */}
          <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-2xs space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Remarks (For Future Activity Improvements)
              </h4>
              {(diffByPath.get('remarks') || diffByPath.get('recommendations')) && (
                <InlineRevisionBadge diff={diffByPath.get('remarks') || diffByPath.get('recommendations')} />
              )}
            </div>
            <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-xs text-slate-700 leading-relaxed whitespace-pre-line">
              {resolvePARRemarksDescription(activeReport) || 'No remarks provided.'}
            </div>
          </div>

          {/* Photo Documentation */}
          <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
                <Camera className="w-4 h-4 text-[#0E4EBD]" />
                Photo Documentation ({photosList.length})
              </h4>
              <div className="flex items-center gap-2">
                {photosList.length > 0 && (
                  <span className="text-[11px] text-slate-500">Click any photo to enlarge</span>
                )}
                {diffByPath.get('photos') && <InlineRevisionBadge diff={diffByPath.get('photos')} />}
              </div>
            </div>

            {photosList.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {photosList.map((p, idx) => (
                  <button
                    key={p.id || idx}
                    type="button"
                    onClick={() =>
                      setLightboxState({
                        items: photosList.map((photo, pIdx) => ({
                          url: photo.url,
                          caption: photo.caption || `Activity Photo ${pIdx + 1}`,
                        })),
                        index: idx,
                        zoom: 1,
                      })
                    }
                    className="rounded-lg overflow-hidden border border-slate-200 aspect-video relative group cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#0E4EBD]"
                  >
                    <img
                      src={p.url}
                      alt={p.caption || `Activity Photo ${idx + 1}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors flex items-center justify-center">
                      <ZoomIn className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" />
                    </div>
                    <div className="absolute inset-x-0 bottom-0 bg-black/70 p-1.5 text-white text-[10px] truncate text-left">
                      {p.caption || `Photo ${idx + 1}`}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-slate-50 border border-dashed border-slate-200 text-xs text-slate-500 text-center">
                No activity photos attached to this report.
              </div>
            )}
          </div>

          {/* VIII. Attachments & Consolidated Uploaded Files */}
          <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-2xs space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
                <Paperclip className="w-4 h-4 text-[#0E4EBD]" />
                VIII. Attachments &amp; Supporting Documents ({totalAttachedDocsCount})
              </h4>
              <button
                type="button"
                onClick={() => setShowDocumentsModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#001A4D] hover:bg-[#0E4EBD] text-white text-[11px] font-bold transition-colors cursor-pointer"
              >
                <Eye className="w-3.5 h-3.5 text-[#FFD41C]" />
                <span>View Voucher &amp; Attachments</span>
              </button>
            </div>

            {activeReport.attachmentsChecklist && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                {[
                  { label: 'Attendance Sheet', checked: Boolean(activeReport.attachmentsChecklist.attendanceSheet || activeReport.attendanceSummary?.attendanceListUrl) },
                  {
                    label: 'Photos of Activity',
                    checked: Boolean(activeReport.attachmentsChecklist.photosOfActivity || photosList.length > 0),
                  },
                  { label: 'Program / Invitation', checked: Boolean(activeReport.attachmentsChecklist.programInvitation) },
                  {
                    label: 'Feedback / Evaluation Summary',
                    checked: Boolean(
                      activeReport.attachmentsChecklist.feedbackSummary ||
                        activeReport.attachmentsChecklist.feedbackEvaluationSummary ||
                        activeReport.evaluationSummaryUrl
                    ),
                  },
                  {
                    label: 'Copies of Certificates, Letters, etc',
                    checked: Boolean(
                      activeReport.attachmentsChecklist.certificatesLetters ||
                        activeReport.attachmentsChecklist.copiesOfCertificatesLetters
                    ),
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border ${
                      item.checked
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-900 font-semibold'
                        : 'bg-slate-50 border-slate-200 text-slate-400'
                    }`}
                  >
                    <span className="font-mono text-xs">{item.checked ? '[✓]' : '[ ]'}</span>
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            )}

            {consolidatedAttachments.length > 0 ? (
              <div className="pt-2 border-t border-slate-100 space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                  Attached Files ({consolidatedAttachments.length})
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {consolidatedAttachments.map((file) => {
                    const isImg = isImageAttachment(file.url, file.fileType, file.name);
                    return (
                      <div
                        key={file.id}
                        className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-blue-50/50 border border-blue-200/80 text-xs"
                      >
                        <div className="min-w-0 flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-white border border-blue-200 flex items-center justify-center shrink-0 text-[#0E4EBD]">
                            {isImg ? <Camera className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-[#001A4D] truncate">{file.name}</p>
                            <span className="text-[10px] font-bold uppercase tracking-wide text-blue-700">
                              {file.category}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {isImg && (
                            <button
                              type="button"
                              onClick={() =>
                                setLightboxState({
                                  items: [{ url: file.url, caption: `${file.category}: ${file.name}` }],
                                  index: 0,
                                  zoom: 1,
                                })
                              }
                              className="p-1.5 rounded-lg bg-white hover:bg-blue-100 text-[#0E4EBD] border border-blue-200 cursor-pointer"
                              title="Preview image"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <a
                            href={file.url}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1.5 rounded-lg bg-white hover:bg-blue-100 text-[#001A4D] border border-blue-200"
                            title="Open or download document"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-slate-50 border border-dashed border-slate-200 text-xs text-slate-500 text-center">
                No downloadable supporting documents attached to this report.
              </div>
            )}
          </div>

          {/* Prepared By & Signatory Pipeline Progress */}
          <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-2xs space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#0E4EBD]" />
              Prepared By &amp; Institutional Signatory Chain
            </h4>

            {/* Maker / Prepared By Card */}
            <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="space-y-0.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                  Prepared by
                </span>
                <p className="font-bold text-slate-900">
                  {activeReport.preparedBy?.name || resolvedMakerSig.name || activeReport.createdByName || 'Organizer'}
                </p>
                <p className="text-[11px] text-slate-600">
                  {activeReport.preparedBy?.roleTitle || resolvedMakerSig.roleTitle}
                </p>
                {(activeReport.preparedBy?.signedAt || activeReport.submittedAt) && (
                  <p className="text-[10px] text-slate-400">
                    Signed: {formatLongDateTime(activeReport.preparedBy?.signedAt || activeReport.submittedAt)}
                  </p>
                )}
              </div>
              {resolvedMakerSig.signatureUrl || activeReport.preparedBy?.signatureUrl || activeReport.submittedBySignatureUrl ? (
                <div className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 flex items-center gap-2">
                  <img
                    src={
                      activeReport.preparedBy?.signatureUrl ||
                      activeReport.submittedBySignatureUrl ||
                      resolvedMakerSig.signatureUrl
                    }
                    alt="Maker Signature"
                    className="h-10 max-w-[130px] object-contain"
                  />
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                    Signed
                  </span>
                </div>
              ) : (
                <span className="text-[11px] text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200 font-semibold">
                  No maker signature attached
                </span>
              )}
            </div>

            {/* Signatories Chain */}
            {chain.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                {chain.map((step, idx) => {
                  const isSignedStep = step.status === 'endorsed' || step.status === 'approved';
                  const isCurrentStep = step.status === 'current';
                  return (
                    <div
                      key={step.id || idx}
                      className={`p-3 rounded-xl border flex items-center justify-between gap-2 ${
                        isSignedStep
                          ? 'bg-emerald-50/50 border-emerald-200'
                          : isCurrentStep
                          ? 'bg-amber-50/60 border-amber-300'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            {resolveSignatoryLabel(step) || 'Noted by:'}
                          </span>
                          <span
                            className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                              isSignedStep
                                ? 'bg-emerald-100 text-emerald-800'
                                : isCurrentStep
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-200 text-slate-600'
                            }`}
                          >
                            {step.status}
                          </span>
                        </div>
                        <p className="font-bold text-slate-900 truncate">{step.signatoryName}</p>
                        <p className="text-[11px] text-slate-600 truncate">{step.roleTitle}</p>
                        {step.signedAt && (
                          <p className="text-[10px] text-slate-400">
                            Signed: {formatLongDateTime(step.signedAt)}
                          </p>
                        )}
                      </div>
                      {isSignedStep && step.signatureUrl && (
                        <div className="bg-white border border-emerald-200 rounded-lg p-1.5 shrink-0">
                          <img
                            src={step.signatureUrl}
                            alt={`${step.signatoryName} signature`}
                            className="h-9 max-w-[100px] object-contain"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Signatory Action Card */}
          <div className="border-2 border-blue-200 rounded-2xl p-5 bg-gradient-to-br from-blue-50/60 to-slate-50 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <PenTool className="w-5 h-5 text-blue-700" />
                <h4 className="text-xs font-black uppercase tracking-wider text-[#001A4D]">
                  Signatory Digital Endorsement & Clearance
                </h4>
              </div>
              <span className="text-xs font-bold text-slate-700">
                {signatorySession?.name} ({signatorySession?.roleTitle || 'Signatory'})
              </span>
            </div>

            {hasSignature ? (
              <div className="flex items-center gap-3 bg-white p-3 rounded-xl border border-blue-200">
                <img
                  src={activeSignatureUrl}
                  alt="Registered Signature"
                  className="h-10 max-w-[120px] object-contain border border-slate-100 rounded p-1 bg-slate-50"
                />
                <div className="text-xs">
                  <span className="text-emerald-700 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Electronic Signature Registered
                  </span>
                  <span className="text-slate-500 text-[11px]">
                    Your official signature will be stamped on the Post-Activity Report.
                  </span>
                </div>
              </div>
            ) : (
              <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl flex items-center justify-between text-xs text-amber-800">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-700" />
                  <span>No electronic signature found for your account.</span>
                </div>
                <button
                  type="button"
                  onClick={onOpenSignaturePad}
                  disabled={isReadOnlyLocked}
                  className="text-xs font-bold text-blue-700 underline hover:text-blue-900 disabled:opacity-40 disabled:cursor-not-allowed disabled:no-underline"
                >
                  Register Signature Now
                </button>
              </div>
            )}

            {isReadOnlyLocked && (
              <div className="px-3.5 py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-700 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  {alreadySignedByMe
                    ? 'Read-Only View: You have already signed this Post-Activity Report. Action buttons are disabled.'
                    : isReturnedDoc
                    ? 'Read-Only View: This report is currently returned for revision.'
                    : 'Read-Only View: Signing controls are disabled for your current session.'}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Demoted Approver / Already Approved Notice Banner */}
        {isDemotedToEndorserOnly && canSignNow && (
          <div className="bg-emerald-50 border-t border-emerald-200 px-6 py-2.5 flex items-center gap-2 text-xs text-emerald-900 flex-shrink-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>
              <strong>Already Approved by {decisionCaps.approvedBySignatoryName || 'Executive Approver'}.</strong>{' '}
              Only one final approval is recorded per report — your signature will be recorded as <strong>Noted by:</strong> (Endorser only).
            </span>
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-slate-200 bg-slate-50 p-4 px-6 flex items-center justify-between flex-wrap gap-2">
          <button
            type="button"
            disabled={isExporting}
            onClick={handleDownloadPdf}
            className="px-4 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4 text-blue-600" />}
            Export PDF
          </button>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              disabled={isSubmitting || !canReturnNow}
              onClick={() => setShowReturnDialog(true)}
              className="px-3.5 py-2 text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 flex items-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <RotateCcw className="w-4 h-4" /> Return for Revision
            </button>
            {canApprove ? (
              <>
                {canEndorseInsteadOfApprove && (
                  <button
                    type="button"
                    disabled={isReadOnlyLocked || isSubmitting || !hasSignature}
                    onClick={() => setPendingConfirmType('endorse')}
                    className="px-4 py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-lg shadow-sm flex items-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    title="Endorse & forward so another designated Approver can grant final approval"
                  >
                    <Send className="w-4 h-4" />
                    <span>{alreadySignedByMe ? 'Already Signed' : isSubmitting ? 'Recording...' : 'Endorse & Forward'}</span>
                  </button>
                )}
                <button
                  type="button"
                  disabled={isReadOnlyLocked || isSubmitting || !hasSignature}
                  onClick={() => setPendingConfirmType('approve')}
                  className="px-5 py-2 text-xs font-bold text-[#FFD41C] bg-[#001A4D] hover:bg-[#0A2E6D] border border-[#FFD41C]/40 rounded-lg shadow-md flex items-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  title={
                    canEndorseInsteadOfApprove
                      ? 'Grant final approval immediately (other designated approvers will become Noted/Endorser only)'
                      : 'Grant executive clearance and fully approve PAR'
                  }
                >
                  <ShieldCheck className="w-4 h-4 text-[#FFD41C]" />
                  <span>{alreadySignedByMe ? 'Already Signed' : isSubmitting ? 'Recording...' : '✓ Sign & Fully Approve'}</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={isReadOnlyLocked || isSubmitting || !hasSignature}
                onClick={() => setPendingConfirmType('endorse')}
                className="px-5 py-2 text-xs font-black text-white bg-gradient-to-r from-[#0E4EBD] to-[#001A4D] hover:opacity-95 rounded-lg shadow-md flex items-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                {alreadySignedByMe ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-[#FFD41C]" />
                    Already Signed
                  </>
                ) : isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Recording...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 text-[#FFD41C]" />
                    {isDemotedToEndorserOnly || decisionCaps.primaryActionMode === 'note_only'
                      ? 'Stamp E-Signature & Note'
                      : 'Stamp E-Signature & Endorse'}
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Dialog for Digital Signing / Approval */}
      {pendingConfirmType && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className={`p-5 flex items-center gap-3.5 border-b ${
              pendingConfirmType === 'approve'
                ? 'bg-gradient-to-r from-[#001A4D] via-[#002B7F] to-[#0E4EBD] text-white'
                : 'bg-emerald-50 border-emerald-200 text-emerald-950'
            }`}>
              <div className={`p-2.5 rounded-2xl ${
                pendingConfirmType === 'approve' ? 'bg-white/10 text-[#FFD41C]' : 'bg-emerald-100 text-emerald-700'
              }`}>
                {pendingConfirmType === 'approve' ? <ShieldCheck className="w-6 h-6" /> : <Send className="w-6 h-6" />}
              </div>
              <div>
                <h3 className="font-bold text-sm">
                  {pendingConfirmType === 'approve' ? 'Confirm Final Executive Approval' : 'Confirm Digital Endorsement'}
                </h3>
                <p className={`text-xs mt-0.5 truncate max-w-xs ${pendingConfirmType === 'approve' ? 'text-white/80' : 'text-emerald-800'}`}>
                  {effectiveTitle}
                </p>
              </div>
            </div>

            <div className="p-5 space-y-3.5">
              <p className="text-xs text-slate-700 leading-relaxed font-medium">
                {pendingConfirmType === 'approve'
                  ? 'Are you sure you want to digitally sign and fully approve this Post-Activity Report?'
                  : 'Are you sure you want to digitally sign and endorse this Post-Activity Report?'}
              </p>

              <div className={`p-3.5 rounded-2xl border text-xs leading-relaxed space-y-2 ${
                pendingConfirmType === 'approve'
                  ? 'bg-amber-50/70 border-amber-200 text-amber-900'
                  : 'bg-slate-50 border-slate-200 text-slate-700'
              }`}>
                <div className="font-bold text-[11px] uppercase tracking-wider text-slate-500">
                  What happens next:
                </div>
                {pendingConfirmType === 'approve' ? (
                  <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-600">
                    <li>Your official digital signature will be sealed onto the Post-Activity Report.</li>
                    {decisionCaps.otherUnsignedApproversCount > 0 && (
                      <li>
                        Because only <strong>one Approver</strong> finalizes each document, the remaining designated approver(s) will automatically be updated to <strong>Noted by:</strong> (Endorser only).
                      </li>
                    )}
                    <li>The report status transitions to <strong>Approved & Cleared</strong>.</li>
                    <li>The report is archived into the Institutional EDMS.</li>
                    <li>The student organization and all stakeholders will be notified.</li>
                  </ul>
                ) : (
                  <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-600">
                    <li>Your official digital signature will be sealed on Stage {currentStage}.</li>
                    <li>The report will advance to the next signatory stage in the pipeline.</li>
                    <li>Next-stage signers will be notified automatically.</li>
                  </ul>
                )}
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setPendingConfirmType(null)}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const type = pendingConfirmType;
                  setPendingConfirmType(null);
                  handleEndorse(type === 'approve' ? 'approve' : 'forward');
                }}
                disabled={isSubmitting}
                className={`px-5 py-2.5 text-xs font-bold rounded-xl transition-all shadow-sm cursor-pointer flex items-center gap-1.5 ${
                  pendingConfirmType === 'approve'
                    ? 'bg-[#001A4D] hover:bg-[#0A2E6D] text-[#FFD41C] border border-[#FFD41C]/40'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                }`}
              >
                {pendingConfirmType === 'approve' ? (
                  <>
                    <ShieldCheck className="w-4 h-4 text-[#FFD41C]" />
                    <span>Confirm & Fully Approve</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Confirm & Endorse</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step/Section-Level Return for Revision Modal */}
      <StepReturnRevisionModal
        isOpen={showReturnDialog}
        onClose={() => setShowReturnDialog(false)}
        onSubmit={handleReturn}
        title="Return Post-Activity Report for Revision"
        subtitle={`Flag specific sections and write targeted feedback for ${effectiveTitle || activeReport.referenceNo}.`}
        steps={PAR_SECTIONS_FOR_REVISION}
        isSubmitting={isSubmitting}
        documentType="PAR"
      />

      {/* Visual Diff Comparison Modal */}
      <RevisionDiffViewerModal
        isOpen={showDiffModal}
        onClose={() => setShowDiffModal(false)}
        documentTitle={effectiveTitle}
        documentType="PAR"
        currentDocument={activeReport}
        previousSnapshot={latestSnapshot}
        customDiffs={parDiffs}
        revisionNumber={activeReport.version || activeReport.revisionCount || ((activeReport.revisionHistory?.length || 0) + 1)}
        revisionHistory={activeReport.revisionHistory}
      />

      {/* Photo & Image Document Lightbox */}
      {lightboxState && lightboxState.items[lightboxState.index] && (
        <div
          className="fixed inset-0 z-[75] bg-slate-950/90 backdrop-blur-sm flex flex-col items-center justify-center p-4"
          onClick={() => setLightboxState(null)}
        >
          <div
            className="w-full max-w-5xl flex items-center justify-between text-white mb-3 px-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="min-w-0">
              <p className="text-sm font-bold truncate">{lightboxState.items[lightboxState.index].caption}</p>
              <span className="text-xs text-slate-300">
                {lightboxState.index + 1} of {lightboxState.items.length}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() =>
                  setLightboxState((prev) =>
                    prev ? { ...prev, zoom: Math.max(0.75, Number((prev.zoom - 0.25).toFixed(2))) } : prev
                  )
                }
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer"
                title="Zoom Out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="text-xs font-mono px-1.5">{Math.round(lightboxState.zoom * 100)}%</span>
              <button
                type="button"
                onClick={() =>
                  setLightboxState((prev) =>
                    prev ? { ...prev, zoom: Math.min(2.5, Number((prev.zoom + 0.25).toFixed(2))) } : prev
                  )
                }
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer"
                title="Zoom In"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <a
                href={lightboxState.items[lightboxState.index].url}
                target="_blank"
                rel="noreferrer"
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white"
                title="Open Original"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
              <button
                type="button"
                onClick={() => setLightboxState(null)}
                className="p-2 rounded-lg bg-white/15 hover:bg-white/25 text-white cursor-pointer"
                title="Close Preview"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div
            className="relative flex-1 w-full max-w-5xl flex items-center justify-center overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {lightboxState.items.length > 1 && (
              <button
                type="button"
                onClick={() =>
                  setLightboxState((prev) =>
                    prev
                      ? {
                          ...prev,
                          index: (prev.index - 1 + prev.items.length) % prev.items.length,
                          zoom: 1,
                        }
                      : prev
                  )
                }
                className="absolute left-2 z-10 p-2.5 rounded-full bg-black/50 hover:bg-black/75 text-white cursor-pointer"
                title="Previous"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}

            <img
              src={lightboxState.items[lightboxState.index].url}
              alt={lightboxState.items[lightboxState.index].caption}
              style={{ transform: `scale(${lightboxState.zoom})` }}
              className="max-h-[78vh] max-w-full object-contain rounded-xl shadow-2xl transition-transform duration-150"
            />

            {lightboxState.items.length > 1 && (
              <button
                type="button"
                onClick={() =>
                  setLightboxState((prev) =>
                    prev
                      ? {
                          ...prev,
                          index: (prev.index + 1) % prev.items.length,
                          zoom: 1,
                        }
                      : prev
                  )
                }
                className="absolute right-2 z-10 p-2.5 rounded-full bg-black/50 hover:bg-black/75 text-white cursor-pointer"
                title="Next"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Dedicated PAR Attendance Monitoring Viewer */}
      <PARAttendanceModal
        isOpen={showAttendanceModal}
        onClose={() => setShowAttendanceModal(false)}
        eventId={activeReport.eventId}
        eventTitle={effectiveTitle}
        estimatedAttendance={effectiveEstimatedNum}
        estimatedAttendanceLabel={String(effectiveEstimatedDisplay)}
        reportedAttendedCount={effectiveAttendedCount}
        reportedTurnoutRate={effectiveTurnoutRate}
        attendanceListUrl={activeReport.attendanceSummary?.attendanceListUrl}
        attendanceListName={activeReport.attendanceSummary?.attendanceListName}
      />

      {/* Dedicated PAR Financial Report & Receipts Viewer */}
      <PARFinancialReportModal
        isOpen={showFinancialModal}
        onClose={() => setShowFinancialModal(false)}
        eventTitle={effectiveTitle}
        totalRevenue={totalRevenue}
        totalDisbursed={totalDisbursed}
        parLineItems={effectiveLineItems}
        parFinancialAttachments={activeReport.financialSummary?.attachments}
        linkedLiquidation={linkedLiquidation}
        copiedFromLiquidation={activeReport.financialSummary?.copiedFromLiquidation}
        anticipatedExpenses={activityFinancials.anticipatedExpenses}
        anticipatedLineItems={activityFinancials.anticipatedLineItems}
        ledgerTransactions={activityFinancials.ledgerTransactions}
        sourceAllocations={activityFinancials.sourceAllocations}
        surplusReturnAllocations={activityFinancials.surplusReturnAllocations}
        deficitDeductionAllocations={activityFinancials.deficitDeductionAllocations}
      />

      {/* Dedicated PAR Disbursement Voucher & Supporting Documents Viewer */}
      <PARDocumentsAndVoucherModal
        isOpen={showDocumentsModal}
        onClose={() => setShowDocumentsModal(false)}
        eventTitle={effectiveTitle}
        linkedLiquidation={linkedLiquidation}
        attachments={consolidatedAttachments}
      />
    </div>
  );
}
