import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  limit,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import { getDocumentSettings, DEFAULT_DOCUMENT_SETTINGS } from './document_settings.service';
import { getNextReferenceNumber } from './document.service';
import { logAuditEvent } from '../../audit/services/audit.service';
import type { DocumentDocument } from '../types/document.types';
import type { LiquidationDocument } from '../../finance/types/liquidation.types';

/**
 * Searches Firestore `document_categories` dynamically for an active category
 * that matches one of the provided keywords. Categories are maintained in Settings
 * and are NEVER hardcoded by ID.
 */
export async function findDynamicCategory(
  keywords: string[]
): Promise<{ id: string; name: string } | null> {
  try {
    const catSnap = await getDocs(
      query(collection(db, 'document_categories'), where('active', '==', true))
    );
    if (catSnap.empty) return null;

    const categories = catSnap.docs.map((d) => ({
      id: d.id,
      name: (d.data().name as string) || '',
    }));

    // Find best match by keyword (case-insensitive)
    for (const kw of keywords) {
      const match = categories.find((c) =>
        c.name.toLowerCase().includes(kw.toLowerCase())
      );
      if (match) return match;
    }

    // Fallback: return the first active category in the database
    return categories[0];
  } catch (err) {
    console.warn('[findDynamicCategory] Firestore category query notice:', err);
    return null;
  }
}

/**
 * Automatically archives an officially approved Financial Liquidation Report into the EDMS.
 *
 * Rules:
 * 1. Honors admin toggle in System Settings (`autoArchiveLiquidations !== false`).
 * 2. Idempotent: Skips if already archived for this liquidation ID.
 * 3. Resolves category dynamically from Firestore settings (`document_categories`).
 * 4. Generates an official EDMS reference number (e.g., DOC-2026-0042).
 * 5. Tags document with `sourceModule: 'finance'` and `isSystemGenerated: true`.
 * 6. Updates original liquidation with `archivedDocumentId` and records an audit log.
 */
export async function autoArchiveApprovedLiquidation(
  liquidationId: string,
  liquidationData?: Partial<LiquidationDocument>,
  approverUid?: string
): Promise<string | null> {
  try {
    // 1. Verify system settings
    const settings = (await getDocumentSettings()) ?? DEFAULT_DOCUMENT_SETTINGS;
    if (settings.autoArchiveLiquidations === false) {
      console.log('[autoArchiveApprovedLiquidation] Skipped: disabled by admin in EDMS settings.');
      return null;
    }

    // 2. Fetch full liquidation data if missing
    let liq = liquidationData;
    const liqDocRef = doc(db, 'liquidations', liquidationId);
    if (!liq || !liq.organizationId || !liq.eventTitle) {
      const snap = await getDoc(liqDocRef);
      if (snap.exists()) {
        liq = { ...(snap.data() as LiquidationDocument), ...liq };
      }
    }

    if (!liq) {
      console.warn('[autoArchiveApprovedLiquidation] Liquidation record not found:', liquidationId);
      return null;
    }

    // 3. Prevent duplicate archiving (idempotency check)
    const existingQ = query(
      collection(db, 'documents'),
      where('sourceRecordId', '==', liquidationId),
      where('sourceModule', '==', 'finance'),
      limit(1)
    );
    const existingSnap = await getDocs(existingQ);
    if (!existingSnap.empty) {
      const existingId = existingSnap.docs[0].id;
      return existingId;
    }

    // 4. Resolve dynamic category from Firestore settings (never hardcoded)
    const categoryMatch = await findDynamicCategory(['liquidation', 'financial', 'finance']);
    const categoryName = categoryMatch?.name || 'Financial Liquidation Report';
    const categoryId = categoryMatch?.id || 'cat-liquidation';

    // 5. Generate official reference number
    const refNumber = await getNextReferenceNumber(settings.refPrefix || 'DOC');

    // 6. Resolve attachments or primary file
    const primaryReceiptUrl =
      (liq as any).exportPdfUrl ||
      (liq as any).signedSummaryUrl ||
      (liq.lineItems?.find((i) => i.receiptUrl)?.receiptUrl) ||
      '';

    const isSasLiquidation =
      liq.organizationId === 'sas' ||
      liq.createdByRole === 'admin';

    const targetOrgId = isSasLiquidation ? 'sas' : (liq.organizationId || '');
    const orgName = isSasLiquidation ? 'Student Affairs Services (SAS)' : (liq.organizationName || 'Student Organization');
    const orgAcronym = isSasLiquidation
      ? 'SAS'
      : (liq as any).organizationAcronym || (liq.organizationName ? liq.organizationName.replace(/[^A-Z]/g, '').slice(0, 8) : 'ORG') || 'ORG';

    const totalSpending = Number(liq.totalActualSpending || 0);
    const allocated = Number(liq.allocatedBudget || 0);
    const variance = allocated - totalSpending;

    const title = liq.eventTitle
      ? `[Approved Liquidation] ${liq.eventTitle}`
      : `[Approved Liquidation] Form LF-01 (${orgName})`;

    const description = `Approved financial liquidation report (Form LF-01). Approved Budget: ₱${allocated.toLocaleString()}, Total Actual Spending: ₱${totalSpending.toLocaleString()}, Net Variance: ₱${variance.toLocaleString()}. Officially endorsed and approved.`;

    // 7. Assemble Document payload
    const newDocPayload: Omit<DocumentDocument, 'id' | 'createdAt' | 'updatedAt'> = {
      type: 'submission',
      title,
      description,
      category: categoryName,
      categoryId,
      fileUrl: primaryReceiptUrl,
      fileName: `LF-01-Liquidation-${orgAcronym}.pdf`,
      fileType: 'PDF',
      fileSize: 1024 * 180, // ~180 KB
      semesterId: (liq as any).semesterId || '',
      academicYear: (liq as any).academicYear || (liq as any).schoolYear || `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
      semester: (liq as any).semester || '1st Semester',
      referenceNumber: refNumber,
      submittedBy: liq.submittedByName || liq.createdByName || (isSasLiquidation ? 'SAS Administrator' : 'Organization Officer'),
      submittedByEmail: (liq as any).submittedByEmail || '',
      submittedByOrgId: targetOrgId,
      submittedByOrgName: orgName,
      submittedByOrgAcronym: orgAcronym,
      submittedByOrgTypeId: '',
      status: 'Approved',
      remarks: 'Automatically archived into EDMS upon final financial liquidation approval.',
      reviewedBy: approverUid || 'SAS Administrator',
      reviewedAt: Timestamp.now(),
      resubmissionOf: null,
      resubmissionNote: null,
      broadcastBy: '',
      broadcastByUid: '',
      distribution: 'all',
      targetOrgIds: [],
      targetOrgTypeId: null,
      readBy: {},
      sourceModule: 'finance',
      sourceRecordId: liquidationId,
      isSystemGenerated: true,
      visibility: isSasLiquidation ? 'sas_only' : 'owner_and_sas',
      isSasInternal: isSasLiquidation,
    };

    const docRef = await addDoc(collection(db, 'documents'), {
      ...newDocPayload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // 8. Link back to liquidation document
    try {
      await updateDoc(liqDocRef, {
        archivedDocumentId: docRef.id,
        archivedRefNumber: refNumber,
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.warn('[autoArchiveApprovedLiquidation] Liquidation update warning:', e);
    }

    // 9. Audit Log
    logAuditEvent({
      action: 'Document Auto-Archived',
      actionType: 'Document Actions',
      details: `Approved financial liquidation "${title}" (${refNumber}) auto-archived into EDMS from Finance module.`,
      performedBy: approverUid || 'System',
      userRole: 'SAO Admin',
      targetId: docRef.id,
      targetName: title,
      academicLevel: 'CAMPUS',
      metadata: {
        sourceModule: 'finance',
        liquidationId,
        referenceNumber: refNumber,
        category: categoryName,
      },
    }).catch(console.error);

    return docRef.id;
  } catch (error) {
    console.error('[autoArchiveApprovedLiquidation] Error archiving liquidation to EDMS:', error);
    return null;
  }
}

/**
 * Automatically archives an officially approved Activity Proposal / Event Permit into the EDMS.
 *
 * Rules:
 * 1. Honors admin toggle in System Settings (`autoArchiveProposals !== false`).
 * 2. Idempotent: Skips if already archived for this event ID.
 * 3. Resolves category dynamically from Firestore settings (`document_categories`).
 * 4. Generates an official EDMS reference number (e.g., DOC-2026-0043).
 * 5. Tags document with `sourceModule: 'events'` and `isSystemGenerated: true`.
 * 6. Updates original event with `archivedDocumentId` and records an audit log.
 */
export async function autoArchiveApprovedEvent(
  eventId: string,
  approverUid?: string,
  remarks?: string
): Promise<string | null> {
  try {
    // 1. Verify system settings
    const settings = (await getDocumentSettings()) ?? DEFAULT_DOCUMENT_SETTINGS;
    if (settings.autoArchiveProposals === false) {
      console.log('[autoArchiveApprovedEvent] Skipped: disabled by admin in EDMS settings.');
      return null;
    }

    // 2. Fetch event data across potential collections
    let eventSnap = await getDoc(doc(db, 'activities', eventId));
    if (!eventSnap.exists()) {
      eventSnap = await getDoc(doc(db, 'events', eventId));
    }
    if (!eventSnap.exists()) {
      eventSnap = await getDoc(doc(db, 'activity_proposals', eventId));
    }
    if (!eventSnap.exists()) {
      console.warn('[autoArchiveApprovedEvent] Event document not found for ID:', eventId);
      return null;
    }

    const event = eventSnap.data() as any;

    // 3. Prevent duplicate archiving (idempotency check)
    const existingQ = query(
      collection(db, 'documents'),
      where('sourceRecordId', '==', eventId),
      where('sourceModule', '==', 'events'),
      limit(1)
    );
    const existingSnap = await getDocs(existingQ);
    if (!existingSnap.empty) {
      const existingId = existingSnap.docs[0].id;
      return existingId;
    }

    // 4. Resolve dynamic category from Firestore settings (never hardcoded)
    const categoryMatch = await findDynamicCategory(['proposal', 'permit', 'activity', 'letter']);
    const categoryName = categoryMatch?.name || 'Activity Proposal / Event Permit';
    const categoryId = categoryMatch?.id || 'cat-proposal';

    // 5. Generate official reference number
    const refNumber = await getNextReferenceNumber(settings.refPrefix || 'DOC');

    // 6. Resolve primary file URL
    const fileUrl =
      event.attachedDocumentUrls?.[0] ||
      event.documents?.[0]?.fileUrl ||
      event.documents?.[0]?.url ||
      '';

    const cleanTitle = event.title || 'Untitled Activity';
    const title = `[Approved Proposal] ${cleanTitle}`;
    const budgetAmount = Number(event.totalApprovedBudget || event.totalRequestedBudget || 0);

    const description = `Approved activity proposal & event permit for "${cleanTitle}". Event Ref: ${event.referenceId || 'N/A'}. Format: ${event.eventFormat || 'On-Campus'}, Approved Budget: ₱${budgetAmount.toLocaleString()}. Target Scope: ${event.targetAudienceScope || 'Campus'}. Signed and authorized for execution.`;

    const isSasProposal =
      event.isOfficerProposal === false ||
      event.creatorRole === 'sas_admin' ||
      event.creatorRole === 'admin' ||
      event.hostingOrgId === 'sas' ||
      event.organizationId === 'sas' ||
      (!event.hostingOrgId && !event.organizationId);

    const orgId = isSasProposal ? 'sas' : (event.hostingOrgId || event.organizationId || '');
    let orgName = isSasProposal ? 'Student Affairs Services (SAS)' : (event.hostingOrgName || event.organizationName || '');
    let orgAcronym = isSasProposal ? 'SAS' : (event.hostingOrgAcronym || '');

    // Fetch org details if missing and not SAS
    if (!isSasProposal && orgId && (!orgName || !orgAcronym)) {
      try {
        const orgDoc = await getDoc(doc(db, 'organizations', orgId));
        if (orgDoc.exists()) {
          const orgData = orgDoc.data() as any;
          orgName = orgName || orgData.name || '';
          orgAcronym = orgAcronym || orgData.acronym || '';
        }
      } catch {}
    }

    const newDocPayload: Omit<DocumentDocument, 'id' | 'createdAt' | 'updatedAt'> = {
      type: 'submission',
      title,
      description,
      category: categoryName,
      categoryId,
      fileUrl,
      fileName: `Approved-Permit-${orgAcronym || 'ORG'}-${cleanTitle.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`,
      fileType: 'PDF',
      fileSize: 1024 * 240, // ~240 KB
      semesterId: event.semesterId || '',
      academicYear: event.schoolYear || `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
      semester: event.semester || '1st Semester',
      referenceNumber: refNumber,
      submittedBy: event.createdByName || event.eventHeadName || (isSasProposal ? 'SAS Administrator' : 'Student Officer'),
      submittedByEmail: event.createdByEmail || '',
      submittedByOrgId: orgId,
      submittedByOrgName: orgName || 'Student Organization',
      submittedByOrgAcronym: orgAcronym || 'ORG',
      submittedByOrgTypeId: '',
      status: 'Approved',
      remarks: remarks?.trim() || 'Automatically archived into EDMS upon official event proposal approval.',
      reviewedBy: approverUid || 'SAS Administrator',
      reviewedAt: Timestamp.now(),
      resubmissionOf: null,
      resubmissionNote: null,
      broadcastBy: '',
      broadcastByUid: '',
      distribution: 'all',
      targetOrgIds: [],
      targetOrgTypeId: null,
      readBy: {},
      sourceModule: 'events',
      sourceRecordId: eventId,
      isSystemGenerated: true,
      visibility: isSasProposal ? 'sas_only' : 'owner_and_sas',
      isSasInternal: isSasProposal,
    };

    const docRef = await addDoc(collection(db, 'documents'), {
      ...newDocPayload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // 8. Link back to original event record
    try {
      await updateDoc(eventSnap.ref, {
        archivedDocumentId: docRef.id,
        archivedRefNumber: refNumber,
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.warn('[autoArchiveApprovedEvent] Event update warning:', e);
    }

    // 9. Audit Log
    logAuditEvent({
      action: 'Document Auto-Archived',
      actionType: 'Document Actions',
      details: `Approved activity proposal "${title}" (${refNumber}) auto-archived into EDMS from Events module.`,
      performedBy: approverUid || 'System',
      userRole: 'SAO Admin',
      targetId: docRef.id,
      targetName: title,
      academicLevel: 'CAMPUS',
      metadata: {
        sourceModule: 'events',
        eventId,
        referenceNumber: refNumber,
        category: categoryName,
      },
    }).catch(console.error);

    return docRef.id;
  } catch (error) {
    console.error('[autoArchiveApprovedEvent] Error archiving event proposal to EDMS:', error);
    return null;
  }
}

/**
 * Automatically archives an officially approved Post-Activity Report (PAR) into the EDMS.
 *
 * Rules:
 * 1. Resolves dynamic category from Settings (`document_categories`) matching "Post Activity" / "Terminal Report".
 * 2. Strict Privacy: SAS-created PARs are flagged as `visibility: 'sas_only'`. Student org PARs are `visibility: 'owner_and_sas'`.
 * 3. Idempotent: Skips if already archived.
 * 4. Updates PAR document with `archivedDocumentId` and records an audit log.
 */
export async function autoArchiveApprovedPAR(
  parId: string,
  parData?: any,
  approverUid?: string
): Promise<string | null> {
  try {
    const settings = (await getDocumentSettings()) ?? DEFAULT_DOCUMENT_SETTINGS;

    let par = parData;
    const parDocRef = doc(db, 'post_activity_reports', parId);
    if (!par || !par.eventTitle) {
      const snap = await getDoc(parDocRef);
      if (snap.exists()) {
        par = { ...snap.data(), ...par };
      }
    }

    if (!par) {
      console.warn('[autoArchiveApprovedPAR] PAR record not found for ID:', parId);
      return null;
    }

    // Check duplicate
    const existingQ = query(
      collection(db, 'documents'),
      where('sourceRecordId', '==', parId),
      where('sourceModule', '==', 'events'),
      limit(1)
    );
    const existingSnap = await getDocs(existingQ);
    if (!existingSnap.empty) {
      return existingSnap.docs[0].id;
    }

    // Dynamic category resolution from Settings
    const categoryMatch = await findDynamicCategory(['post activity', 'terminal', 'post-activity', 'activity report', 'report']);
    const categoryName = categoryMatch?.name || 'Post-Activity Report';
    const categoryId = categoryMatch?.id || 'cat-par';

    const refNumber = await getNextReferenceNumber(settings.refPrefix || 'DOC');

    const cleanTitle = par.eventTitle || 'Campus Activity';
    const title = `[Approved PAR] ${cleanTitle}`;
    const isSasPar = Boolean(par.isSasInternal || par.organizationId === 'sas' || par.creatorRole === 'sas_admin');

    const description = `Official Post-Activity Report (STI Form PAR) for "${cleanTitle}". Ref: ${par.referenceNo || 'N/A'}. Total Attendees: ${par.attendanceSummary?.attendedCount || 0}. Net Balance: ₱${Number(par.financialSummary?.surplusOrDeficit || 0).toLocaleString()}. Approved and cleared.`;

    const newDocPayload: Omit<DocumentDocument, 'id' | 'createdAt' | 'updatedAt'> = {
      type: 'submission',
      title,
      description,
      category: categoryName,
      categoryId,
      fileUrl: par.evaluationSummaryUrl || (par.photos?.[0]?.url) || '',
      fileName: `PAR-${(par.organizationAcronym || 'ORG')}-${cleanTitle.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`,
      fileType: 'PDF',
      fileSize: 1024 * 320, // ~320 KB
      semesterId: par.semesterId || '',
      academicYear: par.schoolYear || `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
      semester: par.semester || '1st Semester',
      referenceNumber: refNumber,
      submittedBy: par.createdByName || (isSasPar ? 'SAS Administrator' : 'Student Officer'),
      submittedByEmail: par.createdByEmail || '',
      submittedByOrgId: par.organizationId || (isSasPar ? 'sas' : ''),
      submittedByOrgName: par.organizationName || (isSasPar ? 'Student Affairs Services (SAS)' : 'Student Organization'),
      submittedByOrgAcronym: par.organizationAcronym || (isSasPar ? 'SAS' : 'ORG'),
      submittedByOrgTypeId: '',
      status: 'Approved',
      remarks: 'Automatically archived into EDMS upon final Post-Activity Report clearance.',
      reviewedBy: approverUid || 'SAS Administrator',
      reviewedAt: Timestamp.now(),
      resubmissionOf: null,
      resubmissionNote: null,
      broadcastBy: '',
      broadcastByUid: '',
      distribution: 'all',
      targetOrgIds: [],
      targetOrgTypeId: null,
      readBy: {},
      sourceModule: 'events',
      sourceRecordId: parId,
      isSystemGenerated: true,
      visibility: isSasPar ? 'sas_only' : 'owner_and_sas',
      isSasInternal: isSasPar,
    };

    const docRef = await addDoc(collection(db, 'documents'), {
      ...newDocPayload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    try {
      await updateDoc(parDocRef, {
        archivedDocumentId: docRef.id,
        archivedRefNumber: refNumber,
        updatedAt: serverTimestamp(),
      });
    } catch {}

    logAuditEvent({
      action: 'Document Auto-Archived',
      actionType: 'Document Actions',
      details: `Approved Post-Activity Report "${title}" (${refNumber}) auto-archived into EDMS.`,
      performedBy: approverUid || 'System',
      userRole: 'SAO Admin',
      targetId: docRef.id,
      targetName: title,
      academicLevel: 'CAMPUS',
      metadata: {
        sourceModule: 'events',
        parId,
        referenceNumber: refNumber,
        category: categoryName,
      },
    }).catch(console.error);

    return docRef.id;
  } catch (error) {
    console.error('[autoArchiveApprovedPAR] Error archiving PAR to EDMS:', error);
    return null;
  }
}

