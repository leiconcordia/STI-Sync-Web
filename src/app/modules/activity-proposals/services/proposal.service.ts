/**
 * src/app/modules/activity-proposals/services/proposal.service.ts
 *
 * Firestore persistence engine and lifecycle management for Activity Proposals.
 */

import { canSignatoryApproveDocument, resolveSignatoryLabel } from '../../signatories/utils/signatory-label.utils';
import { normalizeApprovalStages } from '../../workflow/utils/stage-normalization.utils';
import { stripSasPhrases } from '../../events/utils/organization-display.utils';
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  onSnapshot,
  arrayUnion,
  deleteField,
} from 'firebase/firestore';
import { db, sanitizeFirestorePayload } from '../../../../services/firebase';
import type {
  ActivityProposal,
  ProposalFormData,
  ProposalStatus,
} from '../types/proposal.types';
import {
  removeLedgerTransactionsForLiquidation,
  removeLedgerTransactionsForEvent,
  deductApprovedEventBudget,
} from '../../finance/services/finance.service';
import { autoArchiveApprovedEvent } from '../../reports/services/report-archive.service';
import { softDeleteDocument, restoreDocument } from '../../workflow/services/soft-delete.service';
import { createNotification } from '../../notifications';
import { sanitizeCleanDocumentSnapshot } from '../../workflow/utils/snapshot-cleaner.utils';
import {
  archiveDocumentRevision,
  migrateLegacyVersionHistory,
} from '../../workflow/services/revision-history.service';

export const ACTIVITIES_COLLECTION = 'activities';
export const PROPOSALS_COLLECTION = ACTIVITIES_COLLECTION;
export const EVENTS_COLLECTION = ACTIVITIES_COLLECTION;

export { sanitizeFirestorePayload };

/**
 * Formats a clean display name for notifications and tables.
 * Strips SAS prefixes when a student organization is presenting or co-organizing.
 */
export function formatCleanOrgDisplayName(
  organizers: any,
  hostingOrgId?: string,
  organizationName?: string,
  isOfficer?: boolean
): string {
  const orgList: string[] = Array.isArray(organizers)
    ? organizers.map((o) => String(o || '').trim()).filter(Boolean)
    : typeof organizers === 'string' && organizers.trim()
    ? organizers.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  const studentOrgs = orgList.filter((o) => stripSasPhrases(o).length > 0);

  if (studentOrgs.length > 0) {
    return studentOrgs.join(', ');
  }

  if (organizationName && stripSasPhrases(organizationName).length > 0) {
    return stripSasPhrases(organizationName);
  }

  if (isOfficer) {
    if (hostingOrgId && hostingOrgId !== 'sas' && stripSasPhrases(hostingOrgId).length > 0) {
      return stripSasPhrases(hostingOrgId);
    }
    return 'Student Organization';
  }

  return 'Student Affairs & Services (SAS)';
}

/**
 * Sync an Activity Proposal directly to the `events` collection.
 * This guarantees that every submitted or drafted Activity Proposal appears immediately
 * in both the Admin Activity Approvals table and the Officer Activity Management table.
 */
export async function syncProposalToEventsCollection(
  proposal: Partial<ActivityProposal | ProposalFormData>,
  mappedStatus: 'draft' | 'pending' | 'approved' | 'returned' | 'rejected' | 'completed' = 'pending',
  extraUpdates: Record<string, any> = {}
): Promise<void> {
  if (!proposal.id) return;
  try {
    const eventDocRef = doc(db, EVENTS_COLLECTION, proposal.id);
    const existingSnap = await getDoc(eventDocRef);
    const existingData = existingSnap.exists() ? existingSnap.data() : {};

    // Sessions are only created when an activity is approved and attendance scanners are configured
    let sessions: any[] = [];
    if (existingSnap.exists() && Array.isArray(existingData.sessions) && existingData.sessions.length > 0) {
      sessions = existingData.sessions;
    }

    // Map budget items
    const budgetItems =
      proposal.financialProjections?.expenses?.map((exp, idx) => ({
        id: exp.id || `b_${idx + 1}`,
        item: exp.description || 'Expense Item',
        description: exp.remarks || '',
        quantity: 1,
        unitCost: Number(exp.totalAmount || exp.thisYearProposed || 0),
        approvedAmount: Number(exp.totalAmount || exp.thisYearProposed || 0),
      })) || [];

    const totalBudget =
      Number(proposal.financialProjections?.totalExpenses || 0) ||
      budgetItems.reduce((acc, item) => acc + item.approvedAmount, 0);

    const depts = proposal.targetAudience?.departments || [];
    const levels = proposal.targetAudience?.academicLevels || [];
    const targetAcademicLevel =
      levels.includes('SHS') && levels.includes('College')
        ? 'BOTH'
        : levels.includes('SHS')
        ? 'SHS'
        : 'COLLEGE';

    const currentYear = new Date().getFullYear();
    const status = mappedStatus === 'approved' ? 'approved' : mappedStatus === 'completed' ? 'completed' : mappedStatus;
    const lifecycleStatus =
      mappedStatus === 'approved'
        ? 'approved'
        : mappedStatus === 'completed'
        ? 'completed'
        : mappedStatus === 'pending'
        ? 'pending_review'
        : mappedStatus;

      const SAS_ORGS = ['sas', 'sas_admin', 'sao', 'sao_admin', 'admin', 'sao_office', 'institutional'];
      const refId = (proposal.referenceNo || (proposal as any).referenceId || existingData.referenceId || existingData.referenceNo || '').toString().toUpperCase().trim();
      const cRole = ((proposal.creatorRole || existingData.creatorRole || '') as string).toLowerCase().trim();
      const cEmail = ((proposal.createdByEmail || existingData.createdByEmail || '') as string).toLowerCase().trim();

      const rawHostingOrg = String(
        (proposal as any).hostingOrgId ||
        (proposal as any).organizationId ||
        existingData.hostingOrgId ||
        existingData.organizationId ||
        ''
      ).trim();
      const hasStudentOrgId = Boolean(rawHostingOrg && !SAS_ORGS.includes(rawHostingOrg.toLowerCase()));

      const isExplicitSas =
        refId.includes('-SAS-') ||
        refId.startsWith('EVT-ADM-') ||
        ['admin', 'sas_admin', 'sao_admin', 'sas', 'sao', 'sao_head', 'super_admin'].includes(cRole) ||
        cEmail === 'sao@ormoc.sti.edu.ph' ||
        cEmail.startsWith('sas@') ||
        cEmail.startsWith('sao@') ||
        (proposal as any).isSasDirect === true ||
        existingData.isSasDirect === true ||
        (proposal as any).isInstitutional === true ||
        existingData.isInstitutional === true ||
        (proposal as any).isOfficerProposal === false;

      const isOfficerProposalVal = !isExplicitSas && (
        (proposal as any).isOfficerProposal !== undefined
          ? Boolean((proposal as any).isOfficerProposal)
          : existingData.isOfficerProposal !== undefined
          ? Boolean(existingData.isOfficerProposal)
          : cRole === 'officer' || cRole === 'student_officer' || cRole === 'adviser' || hasStudentOrgId
      );

      const resolvedOrgId = isExplicitSas
        ? 'sas'
        : ((proposal as any).hostingOrgId ||
           (proposal as any).organizationId ||
           existingData.hostingOrgId ||
           existingData.organizationId ||
           (isOfficerProposalVal ? (proposal as any).orgId || 'student_org' : 'sas'));

      const resolvedCreatorRole = isExplicitSas
        ? (cRole && !['officer', 'student_officer', 'adviser'].includes(cRole) ? cRole : 'sas_admin')
        : (cRole || (isOfficerProposalVal ? 'officer' : 'sas_admin'));

      const eventPayload: Record<string, any> = {
        id: proposal.id,
        referenceId: proposal.referenceNo || `AP-${currentYear}-SAS-001`,
        title: proposal.title || 'Untitled Activity',
        tagline: (proposal as any).tagline || existingData.tagline || null,
        description: proposal.description || '',
        objectives: proposal.objectives || [],
        bannerImageUrl:
          (proposal as any).bannerImageUrl !== undefined
            ? (proposal as any).bannerImageUrl
            : existingData.bannerImageUrl || null,
        budgetCustodians:
          (proposal as any).budgetCustodians || existingData.budgetCustodians || [],
        totalAllocatedBudget:
          (proposal as any).totalAllocatedBudget ?? existingData.totalAllocatedBudget ?? 0,
        scannerPinCode: (proposal as any).scannerPinCode || existingData.scannerPinCode || null,
        scannerUserIds: (proposal as any).scannerUserIds || existingData.scannerUserIds || [],
        isVisible:
          (proposal as any).isVisible !== undefined
            ? Boolean((proposal as any).isVisible)
            : existingData.isVisible !== undefined
            ? Boolean(existingData.isVisible)
            : false,
        visibleToStudents:
          (proposal as any).visibleToStudents !== undefined
            ? Boolean((proposal as any).visibleToStudents)
            : existingData.visibleToStudents !== undefined
            ? Boolean(existingData.visibleToStudents)
            : false,
        isPublished:
          (proposal as any).isPublished !== undefined
            ? Boolean((proposal as any).isPublished)
            : existingData.isPublished !== undefined
            ? Boolean(existingData.isPublished)
            : false,
        visibilityStart: (proposal as any).visibilityStart || existingData.visibilityStart || null,
        eventTypeId: 'activity',
        customEventTypeName: 'Activity Proposal (Form AP-01)',
        eventCategoryId: 'campus_activity',
        customEventCategoryName: 'Official Campus Activity',
        isOfficerProposal: isOfficerProposalVal,
        isSasDirect: isExplicitSas || (!isOfficerProposalVal && Boolean((proposal as any).isSasDirect)),
        hostingOrgId: resolvedOrgId,
        organizationId: (proposal as any).organizationId || existingData.organizationId || resolvedOrgId,
        organizationName: isExplicitSas
          ? 'Student Affairs & Services (SAS)'
          : (proposal as any).organizationName && stripSasPhrases((proposal as any).organizationName).length > 0
          ? stripSasPhrases((proposal as any).organizationName)
          : existingData.organizationName && stripSasPhrases(existingData.organizationName).length > 0
          ? stripSasPhrases(existingData.organizationName)
          : (isOfficerProposalVal ? null : 'Student Affairs & Services (SAS)'),
        semesterId: (proposal as any).semesterId || existingData.semesterId || 'current_semester',
        schoolYear: (proposal as any).schoolYear || existingData.schoolYear || `${currentYear}-${currentYear + 1}`,
        // Operational targeting defaults to All Students unless explicitly configured during Publish / Attendance
        targetAcademicLevel:
          existingData.publishAudienceConfigured || existingData.attendanceAudienceConfigured
            ? existingData.targetAcademicLevel || 'BOTH'
            : 'BOTH',
        allStudents:
          existingData.publishAudienceConfigured || existingData.attendanceAudienceConfigured
            ? Boolean(existingData.allStudents)
            : true,
        targetAudienceScope:
          existingData.publishAudienceConfigured || existingData.attendanceAudienceConfigured
            ? existingData.targetAudienceScope || 'all'
            : 'all',
        targetCourses:
          existingData.publishAudienceConfigured || existingData.attendanceAudienceConfigured
            ? existingData.targetCourses || []
            : [],
        targetYearLevels:
          existingData.publishAudienceConfigured || existingData.attendanceAudienceConfigured
            ? existingData.targetYearLevels || []
            : [],
        targetSections:
          existingData.publishAudienceConfigured || existingData.attendanceAudienceConfigured
            ? existingData.targetSections || []
            : [],
        targetAudience:
          existingData.publishAudienceConfigured || existingData.attendanceAudienceConfigured
            ? existingData.targetAudience || null
            : null,
        date: proposal.date || existingData.date || '',
        startTime: proposal.startTime || existingData.startTime || '08:00',
        endTime: proposal.endTime || existingData.endTime || '12:00',
        venueName: proposal.venueName || existingData.venueName || 'STI Campus',
        venueId: proposal.venueId || existingData.venueId || 'campus_venue',
        customVenueName: proposal.venueName || existingData.customVenueName || 'STI Campus',
        sessions,
        eventFormat: 'On-Campus',
        expectedParticipantCount:
          (typeof proposal.estAttendanceCount === 'number' && proposal.estAttendanceCount > 0
            ? proposal.estAttendanceCount
            : null) ??
          (typeof proposal.targetAudience?.expectedAttendees === 'number' && proposal.targetAudience.expectedAttendees > 0
            ? proposal.targetAudience.expectedAttendees
            : null) ??
          (proposal.estimatedAttendance
            ? parseInt(String(proposal.estimatedAttendance).match(/\d+/)?.[0] || '0', 10) || null
            : null) ??
          (typeof (proposal as any).expectedParticipantCount === 'number' && (proposal as any).expectedParticipantCount > 0
            ? (proposal as any).expectedParticipantCount
            : null) ??
          (typeof existingData.estAttendanceCount === 'number' && existingData.estAttendanceCount > 0
            ? existingData.estAttendanceCount
            : null) ??
          (typeof existingData.expectedParticipantCount === 'number' && existingData.expectedParticipantCount > 0
            ? existingData.expectedParticipantCount
            : null) ??
          0,
        estAttendanceCount:
          proposal.estAttendanceCount ??
          existingData.estAttendanceCount ??
          ((proposal.targetAudience as any)?.expectedAttendees || 0),
        estAttendanceQualifier:
          proposal.estAttendanceQualifier ||
          existingData.estAttendanceQualifier ||
          'participants',
        estimatedAttendance:
          proposal.estimatedAttendance ||
          existingData.estimatedAttendance ||
          (proposal.estAttendanceCount ? `${proposal.estAttendanceCount} ${proposal.estAttendanceQualifier || 'participants'}` : ''),
        budgetItems,
        totalApprovedBudget: totalBudget,
        status,
        lifecycleStatus,
        proposalStatus: mappedStatus,
        isActivityProposal: true,
        proposalId: proposal.id,
        proponents: (proposal as any).proponents || existingData.proponents || [],
        organizers: (() => {
          const raw = (proposal as any).organizers || existingData.organizers || [];
          if (Array.isArray(raw)) {
            const studentOrgs = raw.filter((o: any) => typeof o === 'string' && stripSasPhrases(o).length > 0);
            if (isOfficerProposalVal || studentOrgs.length > 0) {
              return studentOrgs.length > 0
                ? studentOrgs
                : [(proposal as any).organizationName || existingData.organizationName || 'Student Organization'].filter((n) => n && stripSasPhrases(n).length > 0);
            }
            return raw;
          }
          return [];
        })(),
        successIndicators: (proposal as any).successIndicators || existingData.successIndicators || [],
        mechanics: (proposal as any).mechanics || existingData.mechanics || [],
        materials: (proposal as any).materials || existingData.materials || [],
        tasks: (proposal as any).tasks || existingData.tasks || [],
        marketingPlan: (proposal as any).marketingPlan || existingData.marketingPlan || [],
        documentationPlan: (proposal as any).documentationPlan || existingData.documentationPlan || [],
        financialProjections: (proposal as any).financialProjections || existingData.financialProjections || null,
        fundingSource:
          proposal.fundingSource ||
          existingData.fundingSource ||
          (isOfficerProposalVal ? 'organization_funds' : 'school_budget'),
        fundingSourceNote: proposal.fundingSourceNote || existingData.fundingSourceNote || null,
        organizationLedgerBalanceAtSubmission:
          proposal.organizationLedgerBalanceAtSubmission ??
          existingData.organizationLedgerBalanceAtSubmission ??
          null,
        historicalReference:
          (proposal as any).historicalReference !== undefined
            ? (proposal as any).historicalReference
            : existingData.historicalReference || null,
        approvalChain: (proposal as any).approvalChain || existingData.approvalChain || [],
        currentStepIndex: (proposal as any).currentStepIndex ?? existingData.currentStepIndex ?? 0,
        currentStageIndex: (proposal as any).currentStageIndex ?? existingData.currentStageIndex ?? 1,
        isPendingSasVetting:
          (proposal as any).isPendingSasVetting !== undefined
            ? Boolean((proposal as any).isPendingSasVetting)
            : Boolean(existingData.isPendingSasVetting),
        sasVettedAt:
          (proposal as any).sasVettedAt !== undefined
            ? (proposal as any).sasVettedAt
            : existingData.sasVettedAt || null,
        sasVettedBy:
          (proposal as any).sasVettedBy !== undefined
            ? (proposal as any).sasVettedBy
            : existingData.sasVettedBy || null,
        submissionDate: (proposal as any).submissionDate || existingData.submissionDate || null,
        isReturned: Boolean((proposal as any).isReturned),
        stepRevisionRemarks: (proposal as any).stepRevisionRemarks || null,
        returnFlags: (proposal as any).returnFlags || [],
        createdBy: proposal.createdByUid || 'creator',
        createdByName: proposal.createdByName || '',
        createdByEmail: proposal.createdByEmail || '',
        creatorRole: resolvedCreatorRole,
        updatedAt: serverTimestamp(),
        ...extraUpdates,
      };

    if (!existingSnap.exists()) {
      eventPayload.createdAt = (proposal as any).createdAt || serverTimestamp();
    }

    await setDoc(eventDocRef, sanitizeFirestorePayload(eventPayload), { merge: true });

    // Dual-sync to 'events' collection for mobile app
    try {
      const mirrorRef = doc(db, 'events', proposal.id);
      await setDoc(mirrorRef, sanitizeFirestorePayload(eventPayload), { merge: true });
    } catch (mirrorErr) {
      console.warn('[syncProposalToEventsCollection] Failed to mirror to events collection:', mirrorErr);
    }
  } catch (err) {
    console.error('[syncProposalToEventsCollection] Failed to sync proposal to events table:', err);
  }
}

/**
 * Generate official STI Activity Proposal Reference Number:
 * Format: AP-[YYYY]-[PREFIX]-[INDEX] (e.g. AP-2026-SAS-001 or AP-2026-IT-002)
 */
export async function generateProposalReferenceNumber(prefix = 'SAS'): Promise<string> {
  const currentYear = new Date().getFullYear();
  try {
    const q = query(
      collection(db, PROPOSALS_COLLECTION),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    const existingCount = snap.size + 1;
    const padded = String(existingCount).padStart(3, '0');
    return `AP-${currentYear}-${prefix.toUpperCase()}-${padded}`;
  } catch (e) {
    const random = Math.floor(100 + Math.random() * 900);
    return `AP-${currentYear}-${prefix.toUpperCase()}-${random}`;
  }
}

/**
 * Save proposal as draft (autosave / manual draft save)
 */
export async function saveProposalDraft(
  formData: ProposalFormData,
  user: { uid: string; name: string; email: string; role?: string; organizationId?: string },
  existingId?: string
): Promise<{ success: boolean; id: string; referenceNo: string }> {
  const docId = existingId || formData.id || doc(collection(db, PROPOSALS_COLLECTION)).id;
  const docRef = doc(db, PROPOSALS_COLLECTION, docId);

  const SAS_ORGS = ['sas', 'sas_admin', 'sao', 'sao_admin', 'admin', 'sao_office', 'institutional'];
  const normUserRole = (user.role || '').toLowerCase().trim();
  const normCreatorRole = ((formData.creatorRole || '') as string).toLowerCase().trim();
  const userEmail = (user.email || '').toLowerCase().trim();
  const refNo = (formData.referenceNo || '').toUpperCase().trim();
  const rawHostingOrg = String(formData.hostingOrgId || formData.organizationId || user.organizationId || '').trim();
  const hasStudentOrgId = Boolean(rawHostingOrg && !SAS_ORGS.includes(rawHostingOrg.toLowerCase()));

  const isSasSubmitter =
    ['admin', 'sas_admin', 'sao_admin', 'sas', 'sao', 'sao_head', 'super_admin'].includes(normUserRole) ||
    ['admin', 'sas_admin', 'sao_admin', 'sas', 'sao', 'sao_head', 'super_admin'].includes(normCreatorRole) ||
    userEmail === 'sao@ormoc.sti.edu.ph' ||
    userEmail.startsWith('sas@') ||
    userEmail.startsWith('sao@') ||
    refNo.includes('-SAS-') ||
    formData.isSasDirect === true ||
    formData.isOfficerProposal === false;

  const isOfficer = !isSasSubmitter && (
    formData.isOfficerProposal === true ||
    hasStudentOrgId ||
    normUserRole === 'officer' ||
    normUserRole === 'student_officer' ||
    normUserRole === 'adviser' ||
    normCreatorRole === 'officer' ||
    normCreatorRole === 'student_officer' ||
    normCreatorRole === 'adviser'
  );

  const referenceNo =
    formData.referenceNo ||
    (await generateProposalReferenceNumber(isOfficer ? 'ORG' : 'SAS'));

  const rawDraftOrganizers = formData.organizers || [];
  const cleanedDraftOrganizers = Array.isArray(rawDraftOrganizers)
    ? rawDraftOrganizers.map((o) => String(o || '').trim()).filter((o) => (isOfficer ? stripSasPhrases(o).length > 0 : o.length > 0))
    : [];
  const finalDraftOrganizers = cleanedDraftOrganizers.length > 0
    ? cleanedDraftOrganizers
    : (isOfficer ? [formData.organizationName || 'Student Organization'] : []);

  const payload: any = {
    ...formData,
    organizers: finalDraftOrganizers,
    id: docId,
    referenceNo,
    status: (formData.status as ProposalStatus) || 'draft',
    currentStepIndex: formData.currentStepIndex ?? 0,
    createdByUid: formData.createdByUid || user.uid,
    createdByName: formData.createdByName || user.name,
    createdByEmail: formData.createdByEmail || user.email,
    creatorRole: isSasSubmitter ? 'sas_admin' : (formData.creatorRole || (user.role as any) || (isOfficer ? 'officer' : 'sas_admin')),
    isOfficerProposal: isOfficer,
    isSasDirect: isSasSubmitter,
    organizationId: isSasSubmitter ? 'sas' : (formData.organizationId || (user as any).organizationId || (formData as any).hostingOrgId || 'student_org'),
    hostingOrgId: isSasSubmitter ? 'sas' : (formData.hostingOrgId || formData.organizationId || (user as any).organizationId || 'student_org'),
    updatedAt: serverTimestamp(),
  };

  if (Array.isArray(formData.approvalChain) && formData.approvalChain.length > 0) {
    payload.approvalChain = normalizeApprovalStages(formData.approvalChain);
  }

  if (!existingId && !formData.id) {
    payload.createdAt = serverTimestamp();
  }

  await setDoc(docRef, sanitizeFirestorePayload(payload), { merge: true });

  // Sync draft to events collection so it appears under "Drafts"
  await syncProposalToEventsCollection(payload, 'draft');

  return { success: true, id: docId, referenceNo };
}

/**
 * Submit an Activity Proposal to enter the institutional review pipeline.
 * On resubmission (if proposal was returned for revision):
 * - Preserves the entire approval chain signatories and stages
 * - Automatically resets step statuses back to Stage 1 ('current')
 * - Updates status back to 'under_review' and syncs to 'pending' in the Activities table
 */
export async function submitProposalForReview(
  formData: ProposalFormData,
  user: { uid: string; name: string; email: string; role?: string; organizationId?: string },
  existingId?: string
): Promise<{ success: boolean; id: string; referenceNo: string }> {
  const docId = existingId || formData.id || doc(collection(db, PROPOSALS_COLLECTION)).id;
  const docRef = doc(db, PROPOSALS_COLLECTION, docId);

  const SAS_ORGS = ['sas', 'sas_admin', 'sao', 'sao_admin', 'admin', 'sao_office', 'institutional'];
  const normUserRole = (user.role || '').toLowerCase().trim();
  const normCreatorRole = ((formData.creatorRole || '') as string).toLowerCase().trim();
  const userEmail = (user.email || '').toLowerCase().trim();
  const refNo = (formData.referenceNo || '').toUpperCase().trim();
  const rawHostingOrg = String(formData.hostingOrgId || formData.organizationId || user.organizationId || '').trim();
  const hasStudentOrgId = Boolean(rawHostingOrg && !SAS_ORGS.includes(rawHostingOrg.toLowerCase()));

  const isSasSubmitter =
    ['admin', 'sas_admin', 'sao_admin', 'sas', 'sao', 'sao_head', 'super_admin'].includes(normUserRole) ||
    ['admin', 'sas_admin', 'sao_admin', 'sas', 'sao', 'sao_head', 'super_admin'].includes(normCreatorRole) ||
    userEmail === 'sao@ormoc.sti.edu.ph' ||
    userEmail.startsWith('sas@') ||
    userEmail.startsWith('sao@') ||
    refNo.includes('-SAS-') ||
    formData.isSasDirect === true ||
    formData.isOfficerProposal === false;

  const isOfficer = !isSasSubmitter && (
    formData.isOfficerProposal === true ||
    hasStudentOrgId ||
    normUserRole === 'officer' ||
    normUserRole === 'student_officer' ||
    normUserRole === 'adviser' ||
    normCreatorRole === 'officer' ||
    normCreatorRole === 'student_officer' ||
    normCreatorRole === 'adviser'
  );

  const isSasAdmin = isSasSubmitter;

  const referenceNo =
    formData.referenceNo ||
    (await generateProposalReferenceNumber(isOfficer ? 'ORG' : 'SAS'));

  const isResubmission =
    formData.status === 'returned' ||
    (formData as any).proposalStatus === 'returned' ||
    (formData as any).isReturned === true ||
    Boolean((formData as any).adviserRemarks) ||
    Boolean((formData as any).stepRevisionRemarks && Object.keys((formData as any).stepRevisionRemarks).length > 0) ||
    Boolean((formData as any).returnFlags && (formData as any).returnFlags.length > 0) ||
    (formData.approvalChain || []).some((s) => s.status === 'returned' || s.status === 'returned_for_revision');

  let currentVersion = Number((formData as any).version || 1);
  if (isResubmission) {
    currentVersion += 1;
  }

  // Initialize or reset approval chain statuses for multi-stage execution (strictly normalized 1..M)
  const isOrgFunds = formData.fundingSource === 'organization_funds';
  // Student Org proposals using School Budget require SAS Pre-Approval Vetting BEFORE Stage 1 signatories can see or sign
  const requiresSasPreApprovalGate = isOfficer && !isOrgFunds;

  const chain = normalizeApprovalStages(formData.approvalChain || []);
  const hasStages = chain.some((s) => typeof s.stageIndex === 'number');
  if (hasStages) {
    chain.forEach((step, idx) => {
      const cleanStep: any = { ...step };
      if (isResubmission) {
        delete cleanStep.signatureUrl;
        delete cleanStep.signedAt;
        delete cleanStep.remarks;
      }
      if (requiresSasPreApprovalGate) {
        chain[idx] = { ...cleanStep, status: 'waiting' };
      } else if ((step.stageIndex ?? 1) === 1) {
        chain[idx] = { ...cleanStep, status: 'current' };
      } else {
        chain[idx] = { ...cleanStep, status: 'waiting' };
      }
    });
  } else if (chain.length > 0) {
    chain.forEach((step, idx) => {
      const cleanStep: any = { ...step };
      if (isResubmission) {
        delete cleanStep.signatureUrl;
        delete cleanStep.signedAt;
        delete cleanStep.remarks;
      }
      if (requiresSasPreApprovalGate) {
        chain[idx] = { ...cleanStep, status: 'waiting' };
      } else {
        chain[idx] = { ...cleanStep, status: idx === 0 ? 'current' : 'waiting' };
      }
    });
  }

  const rawSubmissionOrganizers = formData.organizers || [];
  const cleanedSubmissionOrganizers = Array.isArray(rawSubmissionOrganizers)
    ? rawSubmissionOrganizers.map((o) => String(o || '').trim()).filter((o) => (isOfficer ? stripSasPhrases(o).length > 0 : o.length > 0))
    : [];
  const finalSubmissionOrganizers = cleanedSubmissionOrganizers.length > 0
    ? cleanedSubmissionOrganizers
    : (isOfficer ? [formData.organizationName || 'Student Organization'] : []);

  const payload: any = {
    ...formData,
    organizers: finalSubmissionOrganizers,
    id: docId,
    referenceNo,
    status: 'under_review' as ProposalStatus,
    proposalStatus: 'pending',
    lifecycleStatus: 'pending_review',
    isOfficerProposal: isOfficer,
    isSasDirect: isSasAdmin,
    isPendingSasVetting: requiresSasPreApprovalGate,
    sasVettedAt: null,
    sasVettedBy: null,
    organizationId: isSasAdmin ? 'sas' : (formData.organizationId || (user as any).organizationId || (formData as any).hostingOrgId || 'student_org'),
    hostingOrgId: isSasAdmin ? 'sas' : (formData.hostingOrgId || formData.organizationId || (user as any).organizationId || 'student_org'),
    approvalChain: chain,
    currentStepIndex: 0,
    currentStageIndex: 1,
    version: currentVersion,
    versionLabel: `v${currentVersion}.0`,
    submissionDate:
      formData.submissionDate ||
      new Intl.DateTimeFormat('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }).format(new Date()),
    createdByUid: formData.createdByUid || user.uid,
    createdByName: formData.createdByName || user.name,
    createdByEmail: formData.createdByEmail || user.email,
    creatorRole: isSasAdmin ? 'sas_admin' : 'adviser',
    preparedBy: {
      name: formData.preparedBy?.name || formData.proponents?.[0] || user.name,
      roleTitle: isSasAdmin ? 'SAS Administrator' : 'Organization Adviser',
      email: user.email,
      signatureUrl: (user as any).signatureUrl || formData.submittedBySignatureUrl || (formData as any).signatureUrl || '',
      signedAt: new Date().toISOString(),
    },
    submittedBySignatureUrl: (user as any).signatureUrl || formData.submittedBySignatureUrl || (formData as any).signatureUrl || '',
    updatedAt: serverTimestamp(),
  };

  if (isResubmission) {
    let existingSnapshotData: any = null;
    try {
      const existingSnap = await getDoc(docRef);
      if (existingSnap.exists()) {
        const d = existingSnap.data();
        existingSnapshotData = {
          ...d,
          ...(d.returnedSnapshot || {}),
          title: d.title || formData.title,
          description: d.description || formData.description,
          targetAudience: d.targetAudience || formData.targetAudience,
          sessions: d.sessions || formData.sessions,
          lineItems: d.lineItems || formData.lineItems || d.financialProjections?.expenses || [],
          financialProjections: d.financialProjections || (formData as any).financialProjections || null,
          allocatedBudget: d.allocatedBudget ?? d.totalAllocatedBudget ?? (formData as any).allocatedBudget ?? 0,
          objectives: d.objectives || formData.objectives,
          venueName: d.venueName || d.customVenueName || (formData as any).venueName || '',
          date: d.date || d.sessions?.[0]?.date || (formData as any).date || '',
        };
      }
    } catch (_) {}

    const rawSnapData = existingSnapshotData || {
      title: formData.title || '',
      description: formData.description || '',
      targetAudience: formData.targetAudience || null,
      sessions: formData.sessions || [],
      tasks: formData.tasks || [],
      organizers: formData.organizers || formData.proponents || [],
      proponents: formData.proponents || [],
      successIndicators: formData.successIndicators || [],
      mechanics: formData.mechanics || [],
      materials: formData.materials || [],
      marketingPlan: formData.marketingPlan || [],
      documentationPlan: formData.documentationPlan || [],
      lineItems: formData.lineItems || (formData as any).financialProjections?.expenses || [],
      financialProjections: (formData as any).financialProjections || null,
      allocatedBudget: formData.allocatedBudget || 0,
      objectives: formData.objectives || [],
      venueName: (formData as any).venueName || '',
      date: (formData as any).date || '',
    };
    const cleanSnap = sanitizeCleanDocumentSnapshot(rawSnapData);

    const versionSnapshot = sanitizeFirestorePayload({
      version: currentVersion - 1,
      versionLabel: `v${currentVersion - 1}.0`,
      archivedAt: new Date().toISOString(),
      approvalChainSnapshot: (formData.approvalChain || []).map((s) => sanitizeFirestorePayload({ ...s })),
      returnFlags: formData.returnFlags || [],
      stepRevisionRemarks: formData.stepRevisionRemarks || {},
      returnRemarks: (formData as any).adviserRemarks || (formData as any).returnRemarks || '',
      returnedByName: (formData as any).returnedByName || '',
      returnedByRoleTitle: (formData as any).returnedByRoleTitle || '',
      returnedAt: (formData as any).returnedAt || '',
      resubmittedBy: user.name || 'User',
      resubmittedByUid: user.uid || 'user',
      dataSnapshot: cleanSnap,
    });

    const resubmissionNote = (formData as any).resubmissionNote || '';

    const resubmitHistoryEntry = sanitizeFirestorePayload({
      id: `hist_resubmit_${Date.now()}`,
      action: 'resubmitted',
      version: currentVersion,
      performedBy: user.uid || 'user',
      performedByName: user.name || 'User',
      performedAt: new Date().toISOString(),
      remarks: resubmissionNote
        ? `Proposal revised to v${currentVersion}.0: ${resubmissionNote}`
        : `Proposal revised to v${currentVersion}.0 and resubmitted for Stage 1 review.`,
    });

    // 1. Archive revision snapshot into subcollection (unlimited revisions without 1MB limit)
    try {
      await archiveDocumentRevision('activities', effectiveId, versionSnapshot);
      await archiveDocumentRevision('events', effectiveId, versionSnapshot);
    } catch (archErr) {
      console.warn('[submitProposalForReview] Subcollection revision archival warning:', archErr);
    }

    // 2. Keep parent document lightweight (prune duplicate embedded snapshots)
    payload.version = currentVersion;
    payload.previousSnapshot = deleteField();
    payload.dataSnapshot = deleteField();
    payload.versionHistory = deleteField();
    payload.versionSummary = {
      version: currentVersion,
      latestResubmissionAt: new Date().toISOString(),
      resubmissionNote: resubmissionNote || '',
    };
    payload.stepRevisionRemarks = null;
    payload.returnFlags = [];
    payload.isReturned = false;
    payload.adviserRemarks = null;
    if (resubmissionNote) {
      payload.resubmissionNote = resubmissionNote;
    }
    payload.proposalHistory = arrayUnion(resubmitHistoryEntry);
  } else {
    const submitHistoryEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      action: 'submitted',
      performedBy: user.uid,
      performedByName: user.name || 'Proponent',
      performedAt: new Date().toISOString(),
      version: currentVersion,
      versionLabel: `v${currentVersion}.0`,
      remarks: 'Proposal submitted for institutional review.',
    };
    payload.proposalHistory = arrayUnion(submitHistoryEntry);
  }

  if (!existingId && !formData.id) {
    payload.createdAt = serverTimestamp();
  }

  await setDoc(docRef, sanitizeFirestorePayload(payload), { merge: true });

  // Sync to events collection as pending review (must follow signatory pipeline)
  await syncProposalToEventsCollection(payload, 'pending');

  // Real-time submission notification dispatched to SAS Admin
  try {
    const orgDisplayName = formatCleanOrgDisplayName(
      finalSubmissionOrganizers,
      formData.hostingOrgId,
      formData.organizationName,
      isOfficer
    );
    await createNotification({
      recipientRole: 'admin',
      type: 'document_submission',
      category: 'activity_proposal',
      title: `${payload.isUrgent ? '[URGENT] ' : ''}${
        isResubmission
          ? `Proposal Revised (v${currentVersion}.0): ${payload.title || 'Activity Proposal'}`
          : `New Proposal Submitted: ${payload.title || 'Activity Proposal'}`
      }`,
      message: `${orgDisplayName} submitted ${referenceNo} for institutional review.`,
      resourceId: docId,
      resourceType: 'event',
      actionRoute: `/home/event-approvals?tab=pending&id=${docId}`,
      isUrgent: Boolean(payload.isUrgent),
      targetOrgId: formData.hostingOrgId || undefined,
      targetOrgName: orgDisplayName,
      senderId: user.uid,
      senderName: user.name,
      senderRoleTitle: user.role || 'Officer',
    });
  } catch (notifErr) {
    console.warn('[submitProposalForReview] Notification dispatch error:', notifErr);
  }

  return { success: true, id: docId, referenceNo };
}

/**
 * Fetch a single Activity Proposal by ID (primary from activities collection, fallback to legacy)
 */
export async function getProposalById(id: string): Promise<ActivityProposal | null> {
  const docRef = doc(db, ACTIVITIES_COLLECTION, id);
  const snap = await getDoc(docRef);
  if (snap.exists()) {
    const data = snap.data();

    // Non-blocking self-healing: migrate legacy bloated arrays to subcollection
    if (Array.isArray(data.versionHistory) && data.versionHistory.length > 0) {
      migrateLegacyVersionHistory(ACTIVITIES_COLLECTION, id, data.versionHistory)
        .then(() => {
          updateDoc(docRef, {
            versionHistory: deleteField(),
            previousSnapshot: deleteField(),
            dataSnapshot: deleteField(),
          }).catch(() => {});
        })
        .catch(() => {});
    }

    return { id: snap.id, ...data } as ActivityProposal;
  }
  try {
    const legacySnap = await getDoc(doc(db, 'activity_proposals', id));
    if (legacySnap.exists()) {
      return { id: legacySnap.id, ...legacySnap.data() } as ActivityProposal;
    }
  } catch (e) {}
  try {
    const legacyEvSnap = await getDoc(doc(db, 'events', id));
    if (legacyEvSnap.exists()) {
      return { id: legacyEvSnap.id, ...legacyEvSnap.data() } as ActivityProposal;
    }
  } catch (e) {}
  try {
    const propSnap = await getDoc(doc(db, 'proposals', id));
    if (propSnap.exists()) {
      return { id: propSnap.id, ...propSnap.data() } as ActivityProposal;
    }
  } catch (e) {}
  return null;
}

/**
 * Soft delete a draft proposal (moves to Trash repository, preserves all data indefinitely)
 */
export async function deleteProposal(
  id: string,
  user?: { uid: string; name: string; role?: string },
  reason?: string
): Promise<void> {
  const actor = user || { uid: 'user', name: 'Author', role: 'officer' };
  await softDeleteDocument('activities', id, actor, reason);
}

/**
 * Restores a soft-deleted proposal back to active draft status
 */
export async function restoreProposal(
  id: string,
  user: { uid: string; name: string; role?: string }
): Promise<void> {
  await restoreDocument('activities', id, user);
}

/**
 * Real-time subscription to proposals (filters out soft-deleted records)
 */
export function subscribeToProposals(
  callback: (proposals: ActivityProposal[]) => void,
  creatorUid?: string,
  onError?: (error: Error) => void
): () => void {
  let q = query(collection(db, PROPOSALS_COLLECTION), orderBy('updatedAt', 'desc'));

  if (creatorUid) {
    q = query(
      collection(db, PROPOSALS_COLLECTION),
      where('createdByUid', '==', creatorUid),
      orderBy('updatedAt', 'desc')
    );
  }

  return onSnapshot(
    q,
    (snapshot) => {
      const list: ActivityProposal[] = snapshot.docs
        .map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }))
        .filter((p: any) => p.isDeleted !== true) as ActivityProposal[];
      callback(list);
    },
    (err) => {
      console.error('[ProposalService] Subscription error:', err);
      onError?.(err);
    }
  );
}

/**
 * Endorse or Approve an Activity Proposal by an institutional signatory.
 * Supports multi-stage parallel signing:
 * - In any stage, multiple endorsers can sign in parallel.
 * - Once all signers in the current stage have completed, the next stage unlocks.
 * - When all stages (or the final approver) complete, the proposal transitions to 'approved_president'.
 */
export async function endorseProposal(
  proposalId: string,
  signatory: {
    uid?: string;
    id?: string;
    name: string;
    email: string;
    roleTitle?: string;
    role?: string;
    actionType?: 'endorse' | 'approve';
    signatureUrl?: string;
    canApproveProposal?: boolean;
    approvalDecision?: 'approve' | 'forward';
  },
  remarks = '',
  approvalDecision?: 'approve' | 'forward'
): Promise<{ success: boolean; nextStepIndex: number; isFullyApproved: boolean; stageAdvanced?: boolean }> {
  const docRef = doc(db, PROPOSALS_COLLECTION, proposalId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) throw new Error('Proposal not found');

  const data = snap.data() as ActivityProposal;
  const chain = [...(data.approvalChain || [])];
  if (chain.length === 0) throw new Error('No approval steps found on this proposal');

  const signerUid = signatory.id || signatory.uid || '';
  const signerEmail = (signatory.email || '').toLowerCase();
  const currentStage = data.currentStageIndex ?? 1;

  // 1. Locate the specific step for this signatory that is pending review
  let targetStepIdx = chain.findIndex((s) => {
    const stageMatches = s.stageIndex ? s.stageIndex === currentStage : true;
    const isPending = s.status === 'current' || s.status === 'waiting';
    if (!stageMatches || !isPending) return false;

    if (signerUid && s.signatoryUid === signerUid) return true;
    if (signerEmail && s.signatoryEmail?.toLowerCase() === signerEmail) return true;
    if (signatory.role && s.role === signatory.role) return true;
    return false;
  });

  // Fallback to legacy currentStepIndex if stage match not found
  if (targetStepIdx === -1) {
    targetStepIdx = data.currentStepIndex ?? 0;
  }

  if (targetStepIdx < 0 || targetStepIdx >= chain.length) {
    throw new Error('No pending approval step found for your account on this proposal');
  }

  const targetStep = chain[targetStepIdx];
  const isSchoolAdmin = targetStep.role === 'school_administrator' || signatory.role === 'school_administrator';
  const isPresident = targetStep.role === 'school_president' || signatory.role === 'school_president';
  const canApprove = canSignatoryApproveDocument(signatory as any, 'proposal', targetStep);
  const decision = approvalDecision || signatory.approvalDecision;

  const isExecutiveApprover =
    isPresident ||
    isSchoolAdmin ||
    canApprove ||
    targetStep.actionType === 'approve' ||
    signatory.actionType === 'approve';

  // Determine whether this action is an approval or an endorsement
  let newStatus: 'endorsed' | 'approved' = 'endorsed';
  if (decision === 'approve') {
    newStatus = 'approved';
  } else if (decision === 'forward') {
    newStatus = 'endorsed';
  } else if (canApprove) {
    if (signatory.actionType === 'approve' || targetStep.actionType === 'approve') {
      newStatus = 'approved';
    } else {
      newStatus = 'endorsed';
    }
  } else {
    newStatus = 'endorsed';
  }

  // 2. Mark this signatory's step as endorsed/approved
  const effectiveSigUrl = signatory.signatureUrl || targetStep.signatureUrl || '';
  const effectiveRemarks = remarks || targetStep.remarks || '';
  const signedAt = new Date().toISOString();

  const updatedStep: Record<string, any> = {
    ...targetStep,
    status: newStatus,
    signatoryUid: signerUid || targetStep.signatoryUid || '',
    signedByUid: signerUid || targetStep.signatoryUid || '',
    signatoryName: signatory.name || targetStep.signatoryName || '',
    signedByName: signatory.name || targetStep.signatoryName || '',
    signatoryEmail: signatory.email || targetStep.signatoryEmail || '',
    signedByEmail: signerEmail || targetStep.signatoryEmail || '',
    signedAt,
  };

  if (effectiveSigUrl) {
    updatedStep.signatureUrl = effectiveSigUrl;
  } else {
    delete updatedStep.signatureUrl;
  }

  if (effectiveRemarks) {
    updatedStep.remarks = effectiveRemarks;
  } else {
    delete updatedStep.remarks;
  }

  chain[targetStepIdx] = updatedStep as any;

  // Dual-Approver Resolution within the Executive Stage:
  if (newStatus === 'approved') {
    // Authorized approver chose to fully authorize & approve:
    // Any remaining co-approvers in this stage are waived with clear audit attribution.
    const approverName = signatory.name || targetStep.signatoryName || 'Executive Signatory';
    const approverTitle = signatory.roleTitle || targetStep.roleTitle || (isPresident ? 'School President' : isSchoolAdmin ? 'School Administrator' : 'Executive Approver');

    chain.forEach((s, idx) => {
      if (
        idx !== targetStepIdx &&
        (s.status === 'waiting' || s.status === 'current') &&
        ((s.stageIndex ?? 1) === currentStage || s.actionType === 'approve' || s.role === 'school_president' || s.role === 'school_administrator')
      ) {
        chain[idx] = {
          ...s,
          status: 'waived',
          remarks: `Step waived — Activity proposal authorized and fully approved by ${approverTitle} (${approverName})`,
        };
      }
    });
  } else if (newStatus === 'endorsed' && isExecutiveApprover) {
    // Executive approver chose to endorse & forward for higher approval (e.g. to President):
    // Activate waiting higher approvers in this stage.
    chain.forEach((s, idx) => {
      if (
        (s.stageIndex ?? 1) === currentStage &&
        idx !== targetStepIdx &&
        s.status === 'waiting'
      ) {
        chain[idx] = {
          ...s,
          status: 'current',
        };
      }
    });
  }

  // Clean the entire chain array of any undefined properties
  const sanitizedChain = chain.map((step) => {
    const s: Record<string, any> = { ...step };
    Object.keys(s).forEach((k) => {
      if (s[k] === undefined) {
        delete s[k];
      }
    });
    return s;
  });

  // 3. Determine if current stage has completed all required signatures
  const hasStages = sanitizedChain.some((s) => typeof s.stageIndex === 'number');
  let isFullyApproved = false;
  let nextStageIndex = currentStage;
  let stageAdvanced = false;

  if (hasStages) {
    // Check all steps belonging to currentStage
    const currentStageSteps = sanitizedChain.filter((s) => (s.stageIndex ?? 1) === currentStage);
    const allStageStepsCompleted = currentStageSteps.every(
      (s) => s.status === 'endorsed' || s.status === 'approved' || s.status === 'waived'
    );

    if (allStageStepsCompleted) {
      // Find the next sequential stage number
      const futureStages = sanitizedChain
        .map((s) => s.stageIndex ?? 1)
        .filter((stg) => stg > currentStage)
        .sort((a, b) => a - b);

      if (futureStages.length > 0) {
        nextStageIndex = futureStages[0];
        stageAdvanced = true;

        // Activate all signatories belonging to the new stage
        sanitizedChain.forEach((s, idx) => {
          if ((s.stageIndex ?? 1) === nextStageIndex && s.status === 'waiting') {
            sanitizedChain[idx] = { ...s, status: 'current' };
          }
        });
      } else {
        // No more stages! Entire pipeline is complete
        isFullyApproved = true;
      }
    }
  } else {
    // Legacy linear step progression
    if (newStatus === 'approved') {
      isFullyApproved = true;
    } else {
      const nextIdx = targetStepIdx + 1;
      isFullyApproved = nextIdx >= sanitizedChain.length;
      if (!isFullyApproved && sanitizedChain[nextIdx]) {
        sanitizedChain[nextIdx] = { ...sanitizedChain[nextIdx], status: 'current' };
      }
    }
  }

  // 4. Update Firestore Document with sanitized payload
  const rawUpdates: any = {
    approvalChain: sanitizedChain,
    currentStepIndex: targetStepIdx + 1,
    currentStageIndex: nextStageIndex,
    updatedAt: serverTimestamp(),
  };

  if (isFullyApproved) {
    rawUpdates.status = 'approved_president';
    rawUpdates.proposalStatus = 'approved';
    rawUpdates.lifecycleStatus = 'approved';
    rawUpdates.isApproved = true;
    rawUpdates.isReturned = false;
    rawUpdates.adviserRemarks = null;
    rawUpdates.stepRevisionRemarks = null;
    rawUpdates.returnFlags = [];
    rawUpdates.approvedAt = serverTimestamp();
    rawUpdates.approvedBy = signatory.name || signatory.email || 'Signatory Approver';
  } else {
    rawUpdates.isReturned = false;
  }

  const updates = sanitizeFirestorePayload(rawUpdates);
  await updateDoc(docRef, updates);

  // Sync to events collection
  await syncProposalToEventsCollection(
    { ...data, approvalChain: sanitizedChain },
    isFullyApproved ? 'approved' : 'pending',
    {
      currentStageIndex: nextStageIndex,
      status: isFullyApproved ? 'approved' : 'pending',
      lifecycleStatus: isFullyApproved ? 'approved' : 'pending_review',
      proposalStatus: isFullyApproved ? 'approved' : 'pending',
      isApproved: isFullyApproved,
      isReturned: false,
      adviserRemarks: isFullyApproved ? null : ((data as any).adviserRemarks || null),
      stepRevisionRemarks: isFullyApproved ? null : ((data as any).stepRevisionRemarks || null),
      returnFlags: isFullyApproved ? [] : ((data as any).returnFlags || []),
      ...(isFullyApproved ? {
        approvedAt: serverTimestamp(),
        approvedBy: signatory.name || signatory.email || 'Signatory Approver',
      } : {}),
    }
  );

  // Auto-archive approved activity proposal / permit into EDMS
  if (isFullyApproved) {
    try {
      await autoArchiveApprovedEvent(proposalId, userUid || signatory.email, remarks);
    } catch (archErr) {
      console.warn('[endorseProposal] Approved report storage notice:', archErr);
    }

    // Encumber club treasury ledger if club-funded
    const effectiveFunding = (data as any).fundingSource || (data.isOfficerProposal ? 'organization_funds' : 'school_budget');
    const totalExp = Number(data.financialProjections?.totalExpenses || (data as any).totalApprovedBudget || 0);
    if (effectiveFunding === 'organization_funds' && totalExp > 0) {
      try {
        await deductApprovedEventBudget(proposalId, userUid || signatory.uid || 'system');
      } catch (deductErr) {
        console.warn('[endorseProposal] Club ledger encumbrance notice:', deductErr);
      }
    }
  }

  // Real-time endorsement/approval notification to Officers
  try {
    const orgId = data.hostingOrgId;
    const eventTitle = data.title || (data as any).eventName || 'Activity Proposal';
    const isOfficerEvent = Boolean((data as any).isOfficerProposal || (orgId && orgId !== 'sas'));
    const cleanOrgName = formatCleanOrgDisplayName(
      (data as any).organizers,
      orgId,
      (data as any).organizationName,
      isOfficerEvent
    );
    if (orgId) {
      await createNotification({
        recipientRole: 'officer',
        targetOrgId: orgId,
        targetOrgName: cleanOrgName,
        type: isFullyApproved ? 'document_approved' : 'document_submission',
        category: 'activity_proposal',
        title: isFullyApproved
          ? `Proposal Fully Approved: ${eventTitle}`
          : `Proposal Endorsed by ${signerName}: ${eventTitle}`,
        message: isFullyApproved
          ? `Your activity proposal has received full institutional approval and is cleared for execution.`
          : `${signerName} (${signerRoleTitle || 'Signatory'}) endorsed your proposal for Stage ${nextStageIndex}.`,
        resourceId: proposalId,
        resourceType: 'event',
        actionRoute: `/officer/events`,
        senderId: userUid || signatory.uid,
        senderName: signerName,
        senderRoleTitle: signerRoleTitle,
      });
    }
  } catch (notifErr) {
    console.warn('[endorseProposal] Officer notification error:', notifErr);
  }

  return {
    success: true,
    nextStepIndex: targetStepIdx + 1,
    isFullyApproved,
    stageAdvanced,
  };
}

/**
 * Release an Activity Proposal from SAS Pre-Approval Vetting Gate to Institutional Signatory Pipeline.
 * - Crucial: NO SAS ink signature required.
 * - Activates Stage 1 signatories and sets proposal status to 'under_review'.
 */
export async function releaseProposalToSignatories(
  proposalId: string,
  sasAdminUid: string,
  remarks = ''
): Promise<{ success: boolean }> {
  const docRef = doc(db, PROPOSALS_COLLECTION, proposalId);
  let snap = await getDoc(docRef);
  let data: ActivityProposal | null = snap.exists() ? (snap.data() as ActivityProposal) : null;

  if (!data) {
    for (const col of ['events', 'activity_proposals', 'proposals']) {
      try {
        const fbSnap = await getDoc(doc(db, col, proposalId));
        if (fbSnap.exists()) {
          data = fbSnap.data() as ActivityProposal;
          break;
        }
      } catch {}
    }
  }
  if (!data) throw new Error('Proposal not found');

  const chain = normalizeApprovalStages(data.approvalChain || []);

  // Activate Stage 1 signers
  chain.forEach((s, idx) => {
    if ((s.stageIndex ?? 1) === 1) {
      chain[idx] = { ...s, status: 'current' };
    } else {
      chain[idx] = { ...s, status: 'waiting' };
    }
  });

  const vettedAt = new Date().toISOString();

  const clearanceEntry = {
    id: `hist_sas_release_${Date.now()}`,
    action: 'sas_vetted_and_released',
    performedBy: sasAdminUid,
    performedByName: 'Student Affairs & Services',
    performedAt: vettedAt,
    remarks: remarks || 'Cleared and released by SAS Admin to Institutional Signatory Pipeline.',
  };

  const updatePayload: any = {
    approvalChain: chain,
    currentStageIndex: 1,
    status: 'under_review' as ProposalStatus,
    proposalStatus: 'pending',
    lifecycleStatus: 'pending_review',
    isPendingSasVetting: false,
    sasVettedAt: vettedAt,
    sasVettedBy: sasAdminUid,
    updatedAt: serverTimestamp(),
    proposalHistory: arrayUnion(clearanceEntry),
  };

  await setDoc(docRef, sanitizeFirestorePayload(updatePayload), { merge: true });

  // Sync to events collection
  try {
    const evRef = doc(db, 'events', proposalId);
    await setDoc(evRef, sanitizeFirestorePayload({
      approvalChain: chain,
      currentStageIndex: 1,
      status: 'pending',
      proposalStatus: 'pending',
      lifecycleStatus: 'pending_review',
      isPendingSasVetting: false,
      sasVettedAt: vettedAt,
      sasVettedBy: sasAdminUid,
      proposalHistory: arrayUnion(clearanceEntry),
      updatedAt: serverTimestamp(),
    }), { merge: true });
  } catch (_) {}

  // Dispatch notifications to Stage 1 signers
  const stage1Signers = chain.filter((s) => (s.stageIndex ?? 1) === 1);
  for (const signer of stage1Signers) {
    if (signer.signatoryUid || signer.signatoryEmail) {
      try {
        await createNotification({
          recipientRole: 'signatory',
          recipientId: signer.signatoryUid || signer.signatoryEmail,
          title: `Proposal Released: ${data.title || 'Activity Proposal'}`,
          message: `Activity proposal "${data.title || 'Activity Proposal'}" has been cleared by SAS and is now awaiting your review in Stage 1.`,
          type: 'document_submission',
          category: 'activity_proposal',
          resourceId: proposalId,
          resourceType: 'event',
          actionRoute: '/signatory/proposals',
          senderId: sasAdminUid,
          senderName: 'Student Affairs & Services',
          senderRoleTitle: 'Student Affairs & Services',
        });
      } catch (notifErr) {
        console.warn('[releaseProposalToSignatories] Signer notification error:', notifErr);
      }
    }
  }

  return { success: true };
}

/**
 * Return an Activity Proposal for revision
 */
export async function returnProposalForRevision(
  proposalId: string,
  signatory: { uid?: string; id?: string; name: string; email: string; roleTitle?: string; role?: string },
  remarks: string,
  stepRevisionRemarks?: Record<string, string>,
  returnFlags?: string[],
  returnDeadline?: string
): Promise<{ success: boolean }> {
  const docRef = doc(db, PROPOSALS_COLLECTION, proposalId);
  let snap = await getDoc(docRef);
  let data: ActivityProposal | null = snap.exists() ? (snap.data() as ActivityProposal) : null;
  if (!data) {
    for (const col of ['events', 'activity_proposals', 'proposals']) {
      try {
        const fbSnap = await getDoc(doc(db, col, proposalId));
        if (fbSnap.exists()) {
          data = fbSnap.data() as ActivityProposal;
          break;
        }
      } catch {}
    }
  }
  if (!data) throw new Error('Proposal not found');

  const chain = [...(data.approvalChain || [])];
  const signerUid = signatory.id || signatory.uid || '';
  const signerEmail = (signatory.email || '').toLowerCase();
  const currentStage = data.currentStageIndex ?? 1;

  // Locate the reviewer's step
  let targetStepIdx = chain.findIndex((s) => {
    const stageMatches = s.stageIndex ? s.stageIndex === currentStage : true;
    if (!stageMatches) return false;
    if (signerUid && s.signatoryUid === signerUid) return true;
    if (signerEmail && s.signatoryEmail?.toLowerCase() === signerEmail) return true;
    if (signatory.role && s.role === signatory.role) return true;
    return false;
  });

  if (targetStepIdx === -1) {
    targetStepIdx = data.currentStepIndex ?? 0;
  }

  if (targetStepIdx >= 0 && targetStepIdx < chain.length) {
    const s: Record<string, any> = {
      ...chain[targetStepIdx],
      status: 'returned',
    };
    // Strip electronic signatures and timestamps from returned step
    delete s.signatureUrl;
    delete s.signedAt;

    if (remarks) {
      s.remarks = remarks;
    } else {
      delete s.remarks;
    }
    Object.keys(s).forEach((k) => {
      if (s[k] === undefined) delete s[k];
    });
    chain[targetStepIdx] = s as ProposalApprovalStep;
  }

  const sanitizedChain = chain.map((step, idx) => {
    const s: Record<string, any> = { ...step };
    if (idx === targetStepIdx) {
      delete s.signatureUrl;
      delete s.signedAt;
      s.status = 'returned';
    }
    Object.keys(s).forEach((k) => {
      if (s[k] === undefined) delete s[k];
    });
    return s as ProposalApprovalStep;
  });

  const returnedAtStr = new Date().toISOString();
  const signerName = signatory.name || (signatory as any).displayName || 'Institutional Signatory';
  const signerRoleTitle = signatory.roleTitle || (signatory as any).title || 'Signatory Reviewer';
  const effectiveDeadline =
    returnDeadline || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // Canonicalize step revision remarks to prevent duplicate aliases ('2', 'step-2', etc.)
  const canonicalStepRemarks: Record<string, string> = {};
  if (stepRevisionRemarks && typeof stepRevisionRemarks === 'object') {
    Object.entries(stepRevisionRemarks).forEach(([key, text]) => {
      if (!text || typeof text !== 'string' || !text.trim()) return;
      const numMatch = key.match(/(?:step[-_\s]*)?(\d+)/i);
      const isNumberedStep = Boolean(numMatch && !key.startsWith('item_'));
      const canonicalKey = isNumberedStep ? `step_${numMatch![1]}` : key;
      if (!canonicalStepRemarks[canonicalKey] || text.trim().length > canonicalStepRemarks[canonicalKey].length) {
        canonicalStepRemarks[canonicalKey] = text.trim();
      }
    });
  }

  const returnHistoryEntry = sanitizeFirestorePayload({
    id: `hist_return_${Date.now()}`,
    action: 'returned_for_revision',
    performedBy: signerUid || 'signatory',
    performedByName: signerName,
    roleTitle: signerRoleTitle,
    performedAt: returnedAtStr,
    remarks: remarks?.trim() || 'Returned for revision.',
    stepRevisionRemarks: canonicalStepRemarks,
    returnFlags: returnFlags || [],
  });

  const cleanSnap = sanitizeCleanDocumentSnapshot(data);

  // 1. Archive revision snapshot to subcollection (unlimited revisions without 1MB limit)
  try {
    const revPayload = {
      version: Number(data.version || 1),
      versionLabel: `v${Number(data.version || 1)}.0`,
      dataSnapshot: cleanSnap,
      returnFlags: returnFlags || [],
      stepRevisionRemarks: canonicalStepRemarks,
      returnRemarks: remarks || 'Returned for revision.',
      returnedBy: signerUid || 'signatory',
      returnedByName: signerName,
      returnedByRoleTitle: signerRoleTitle,
      returnedAt: returnedAtStr,
      archivedAt: new Date().toISOString(),
    };
    await archiveDocumentRevision('activities', proposalId, revPayload);
    await archiveDocumentRevision('events', proposalId, revPayload);
  } catch (archErr) {
    console.warn('[returnProposalForRevision] Subcollection archival warning:', archErr);
  }

  const rawUpdates = {
    status: 'returned' as ProposalStatus,
    proposalStatus: 'returned',
    lifecycleStatus: 'returned',
    isReturned: true,
    isApproved: false,
    approvedAt: null,
    approvedBy: null,
    returnDeadline: effectiveDeadline,
    adviserRemarks: remarks || null,
    returnRemarks: remarks || null,
    stepRevisionRemarks: canonicalStepRemarks,
    returnFlags: returnFlags || [],
    returnedByName: signerName,
    returnedByRoleTitle: signerRoleTitle,
    returnedByEmail: signerEmail,
    returnedAt: returnedAtStr,
    approvalChain: sanitizedChain,
    proposalHistory: arrayUnion(returnHistoryEntry),
    returnedSnapshot: cleanSnap,
    previousSnapshot: deleteField(),
    dataSnapshot: deleteField(),
    versionHistory: deleteField(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(docRef, sanitizeFirestorePayload(rawUpdates), { merge: true });

  // Sync to events and activities collection as 'returned' with isReturned: true
  await syncProposalToEventsCollection(
    { ...data, approvalChain: sanitizedChain },
    'returned',
    {
      isReturned: true,
      isApproved: false,
      approvedAt: null,
      approvedBy: null,
      status: 'returned',
      proposalStatus: 'returned',
      lifecycleStatus: 'returned',
      adviserRemarks: remarks,
      returnRemarks: remarks,
      stepRevisionRemarks: canonicalStepRemarks,
      returnFlags: returnFlags || [],
      returnedByName: signerName,
      returnedByRoleTitle: signerRoleTitle,
      returnedByEmail: signerEmail,
      returnedAt: returnedAtStr,
      returnDeadline: effectiveDeadline,
    }
  );

  // Real-time return notification dispatched to Officers
  try {
    const orgId = data.hostingOrgId;
    const eventTitle = data.title || (data as any).eventName || 'Activity Proposal';
    const isOfficerEvent = Boolean((data as any).isOfficerProposal || (orgId && orgId !== 'sas'));
    const cleanOrgName = formatCleanOrgDisplayName(
      (data as any).organizers,
      orgId,
      (data as any).organizationName,
      isOfficerEvent
    );
    if (orgId) {
      await createNotification({
        recipientRole: 'officer',
        targetOrgId: orgId,
        targetOrgName: cleanOrgName,
        type: 'document_returned',
        category: 'activity_proposal',
        title: `Proposal Returned for Revision: ${eventTitle}`,
        message: remarks
          ? `${signerName} (${signerRoleTitle || 'Signatory'}): "${remarks}"`
          : `${signerName} returned your proposal for revision. Please review feedback remarks.`,
        resourceId: proposalId,
        resourceType: 'event',
        actionRoute: `/officer/events`,
        isUrgent: true,
        senderId: signerUid,
        senderName: signerName,
        senderRoleTitle: signerRoleTitle,
      });
    }
  } catch (notifErr) {
    console.warn('[returnProposalForRevision] Officer notification error:', notifErr);
  }

  return { success: true };
}

/**
 * Reject an Activity Proposal (terminal state, preserves record for audit, title not banned)
 */
export async function rejectProposal(
  proposalId: string,
  signatory: { uid?: string; id?: string; name: string; email: string; roleTitle?: string; role?: string },
  reason: string
): Promise<{ success: boolean }> {
  const docRef = doc(db, PROPOSALS_COLLECTION, proposalId);
  let snap = await getDoc(docRef);
  let data: ActivityProposal | null = snap.exists() ? (snap.data() as ActivityProposal) : null;
  if (!data) {
    for (const col of ['events', 'activity_proposals', 'proposals']) {
      try {
        const fbSnap = await getDoc(doc(db, col, proposalId));
        if (fbSnap.exists()) {
          data = fbSnap.data() as ActivityProposal;
          break;
        }
      } catch {}
    }
  }
  if (!data) throw new Error('Proposal not found');

  const rawUpdates = {
    status: 'rejected' as ProposalStatus,
    proposalStatus: 'rejected',
    lifecycleStatus: 'rejected',
    rejectionReason: reason,
    rejectedAt: serverTimestamp(),
    rejectedByName: signatory.name,
    updatedAt: serverTimestamp(),
  };

  await setDoc(docRef, sanitizeFirestorePayload(rawUpdates), { merge: true });

  // Sync to events collection as 'rejected'
  await syncProposalToEventsCollection(data, 'rejected', {
    rejectionReason: reason,
  });

  return { success: true };
}

/**
 * Withdraw an Activity Proposal back to 'draft' status so author can edit before signatory endorsements.
 * - Organization proposals with school_budget can be withdrawn even after SAS clearance, ONLY until 1+ signatories sign.
 * - Organization proposals with organization_funds cannot be withdrawn once SAS has digitally signed/approved.
 * - Notifies designated signatories and SAS when a submitted/cleared proposal is withdrawn by its maker.
 */
export async function withdrawProposal(
  proposalId: string,
  userId: string,
  userName?: string
): Promise<void> {
  const docRef = doc(db, PROPOSALS_COLLECTION, proposalId);
  let snap = await getDoc(docRef);
  let data: any = snap.exists() ? (snap.data() as ActivityProposal) : null;

  if (!data) {
    for (const col of ['events', 'proposals', 'activity_proposals']) {
      try {
        const fbSnap = await getDoc(doc(db, col, proposalId));
        if (fbSnap.exists()) {
          data = fbSnap.data();
          break;
        }
      } catch {}
    }
  }

  if (!data) throw new Error('Proposal not found.');

  const currentStatus = (data.status || data.proposalStatus || '').toLowerCase().trim();
  if (currentStatus !== 'under_review' && currentStatus !== 'pending' && currentStatus !== 'pending_review') {
    throw new Error('Only proposals currently under review can be withdrawn.');
  }

  // Enforce signature lock conditions
  const rawChain: any[] = Array.isArray(data.approvalChain) ? data.approvalChain : [];
  const anySignatorySigned = rawChain.some(
    (s: any) =>
      s &&
      (s.status === 'endorsed' ||
        s.status === 'approved' ||
        Boolean(s.signedAt) ||
        Boolean(s.signatureUrl))
  );
  const isOrgFunds = data.fundingSource === 'organization_funds';

  if (isOrgFunds) {
    if (anySignatorySigned || Boolean(data.sasSignedAt) || Boolean(data.isApproved) || Boolean(data.approvedBy)) {
      throw new Error(
        'Cannot withdraw: SAS has already digitally signed and approved this Organization Funds proposal.'
      );
    }
  } else if (anySignatorySigned) {
    throw new Error(
      'Cannot withdraw: One or more signatories have already digitally signed this proposal. Request a Return for Revision instead.'
    );
  }

  const wasClearedBySas = Boolean(data.sasVettedAt) || data.isPendingSasVetting === false;

  // Reset chain steps cleanly
  const chain = rawChain.map((step) => {
    const s: any = { ...step };
    s.status = 'waiting';
    delete s.signedAt;
    delete s.signatureUrl;
    delete s.remarks;
    return s;
  });

  const actorName = userName || data.createdByName || 'Proponent';
  const historyEntry = {
    id: `log-${Date.now()}`,
    action: 'withdrawn',
    performedBy: userId,
    performedByName: actorName,
    performedAt: new Date().toISOString(),
    remarks: `Proposal withdrawn back to draft by ${actorName} for revision.`,
  };

  const payload: any = {
    proposalStatus: 'draft',
    status: 'draft',
    lifecycleStatus: 'draft',
    isPendingSasVetting: false,
    sasVettedAt: null,
    sasVettedBy: null,
    currentStageIndex: 1,
    currentStepIndex: 0,
    approvalChain: chain,
    proposalHistory: arrayUnion(historyEntry),
    updatedAt: serverTimestamp(),
  };

  await setDoc(docRef, sanitizeFirestorePayload(payload), { merge: true });

  // Sync to events, proposals, activity_proposals collections
  await syncProposalToEventsCollection({ ...data, ...payload, id: proposalId }, 'draft');

  // Notify signatories and SAS so reviewers know the maker withdrew the submission
  try {
    const notifiedKeys = new Set<string>();
    const titleLabel = data.title || 'Activity Proposal';
    const refLabel = data.referenceNo || data.referenceId || proposalId;

    for (const step of rawChain) {
      const recId = step?.signatoryUid || step?.signatoryId || step?.uid || step?.signatoryEmail || '';
      if (!recId || notifiedKeys.has(String(recId).toLowerCase())) continue;
      notifiedKeys.add(String(recId).toLowerCase());

      await createNotification({
        recipientId: String(recId),
        recipientRole: 'signatory',
        title: 'Activity Proposal Withdrawn by Maker',
        message: `"${titleLabel}" (${refLabel}) was withdrawn back to Draft by ${actorName}${wasClearedBySas ? ' after SAS release' : ''}. No signature action is needed unless resubmitted.`,
        type: 'proposal',
        priority: 'medium',
        resourceId: proposalId,
        resourceType: 'event',
        actionRoute: '/signatory/proposals',
        metadata: { proposalId, withdrawnBy: actorName },
      }).catch(() => {});
    }

    // Also notify SAS Office if authored by a student organization
    if (data.isOfficerProposal !== false) {
      await createNotification({
        recipientId: 'sas_admin',
        recipientRole: 'admin',
        title: 'Organization Proposal Withdrawn',
        message: `${actorName} withdrew "${titleLabel}" (${refLabel}) back to Draft for revisions.`,
        type: 'proposal',
        priority: 'low',
        resourceId: proposalId,
        resourceType: 'event',
        actionRoute: '/admin/approvals',
        metadata: { proposalId, withdrawnBy: actorName },
      }).catch(() => {});
    }
  } catch (notifErr) {
    console.warn('[withdrawProposal] Non-critical notification notice:', notifErr);
  }
}




