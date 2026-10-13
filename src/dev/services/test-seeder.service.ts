import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  Timestamp,
  serverTimestamp,
  orderBy,
} from 'firebase/firestore';
import { db } from '../../services/firebase';
import { StudentDocument, AcademicLevel, StudentYearLevel, StudentSemester } from '../../app/modules/students/types/student.types';
import { EventDocument, EventSession, EventScanner, BudgetLineItem } from '../../app/modules/events/types/event.types';
import { ATTENDANCE_COLLECTION } from '../../app/modules/attendance/services/attendance.service';
import { AttendanceStatus } from '../../app/modules/attendance/types/attendance.types';
import { PAYABLES_COLLECTION, syncStudentPayablesForActiveEvents } from '../../app/modules/finance/services/payable.service';
import { PayableType } from '../../app/modules/finance/types/payable.types';
import { COURSES_COLLECTION, DEPARTMENTS_COLLECTION, SECTIONS_COLLECTION, SEMESTERS_COLLECTION } from '../../app/modules/academic/services/academic.service';
import { EVENTS_COLLECTION, generatePayablesForEvent } from '../../app/modules/events/services/event.service';
import { SIGNATORIES_COLLECTION, getInstitutionalSignatories } from '../../app/modules/signatories/services/signatory.service';
import { InstitutionalSignatory } from '../../app/modules/signatories/types/signatory.types';
import {
  PROPOSALS_COLLECTION,
  endorseProposal,
  submitProposalForReview,
  generateProposalReferenceNumber,
} from '../../app/modules/activity-proposals/services/proposal.service';
import { buildDynamicApprovalChain } from '../../app/modules/activity-proposals/utils/proposal-routing';
import {
  LIQUIDATIONS_COLLECTION,
  createLiquidationReport,
  endorseLiquidationStep,
  generateDefaultLiquidationChain,
} from '../../app/modules/finance/services/liquidation.service';
import {
  PAR_COLLECTION,
  saveOrSubmitPAR,
  endorsePARStep,
  generateDefaultPARSignatoryChain,
} from '../../app/modules/post-activity-reports/services/par.service';
const DOCUMENTS_COLLECTION = 'documents';

// ─── Helper to recursively strip undefined values ─────────────────────────────
export function cleanForFirestore<T extends Record<string, any>>(obj: T): T {
  const result: any = Array.isArray(obj) ? [] : {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      if (
        value !== null &&
        typeof value === 'object' &&
        !(value instanceof Timestamp) &&
        !(value instanceof Date) &&
        typeof (value as any).toDate !== 'function'
      ) {
        result[key] = cleanForFirestore(value);
      } else {
        result[key] = value;
      }
    }
  }
  return result;
}

// ─── Calligraphic Signature SVG Generator (Used as fallback if none uploaded) ─
export function generateCalligraphicSignature(name: string, roleTitle: string): string {
  const sanitizedName = (name || 'STI Signatory').replace(/[<>&"']/g, '');
  const sanitizedTitle = (roleTitle || '').replace(/[<>&"']/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="110" viewBox="0 0 320 110">
    <defs>
      <linearGradient id="sigGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#1e3a8a"/>
        <stop offset="100%" stop-color="#0284c7"/>
      </linearGradient>
    </defs>
    <path d="M 25 70 Q 55 20, 95 65 T 165 45 T 235 60 T 290 35" fill="none" stroke="url(#sigGrad)" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M 40 82 Q 130 92, 275 75" fill="none" stroke="#1d4ed8" stroke-width="1.8" stroke-linecap="round"/>
    <text x="160" y="98" font-family="'Brush Script MT', 'Dancing Script', cursive, sans-serif" font-size="20" font-weight="bold" fill="#0f172a" text-anchor="middle">${sanitizedName}</text>
    <text x="160" y="108" font-family="Inter, sans-serif" font-size="8.5" font-weight="600" fill="#64748b" text-anchor="middle" letter-spacing="0.5">${sanitizedTitle}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. DYNAMIC SIGNATURE LOOKUP & REAL FIRESTORE SIGNATORIES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Retrieves the real uploaded digital signature from Firestore for a given signatory.
 * Checks institutional_signatories collection by UID, ID, email, or name.
 */
export async function getRealUploadedSignature(
  step: { signatoryUid?: string; signatoryEmail?: string; signatoryName?: string; signatureUrl?: string }
): Promise<string> {
  // 1. If step already has a verified signatureUrl, use it
  if (step.signatureUrl && step.signatureUrl.length > 20) {
    return step.signatureUrl;
  }

  // 2. Query Firestore institutional_signatories by UID
  if (step.signatoryUid) {
    try {
      const snap = await getDoc(doc(db, SIGNATORIES_COLLECTION, step.signatoryUid));
      if (snap.exists()) {
        const data = snap.data();
        if (data.signatureUrl || data.signatureDataUrl) {
          return data.signatureUrl || data.signatureDataUrl;
        }
      }
    } catch (_) {}
  }

  // 3. Query Firestore institutional_signatories by Email
  if (step.signatoryEmail) {
    try {
      const q = query(
        collection(db, SIGNATORIES_COLLECTION),
        where('email', '==', step.signatoryEmail.trim().toLowerCase())
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const data = snap.docs[0].data();
        if (data.signatureUrl || data.signatureDataUrl) {
          return data.signatureUrl || data.signatureDataUrl;
        }
      }
    } catch (_) {}
  }

  // 4. Query Firestore institutional_signatories by Name
  if (step.signatoryName) {
    try {
      const q = query(
        collection(db, SIGNATORIES_COLLECTION),
        where('name', '==', step.signatoryName.trim())
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const data = snap.docs[0].data();
        if (data.signatureUrl || data.signatureDataUrl) {
          return data.signatureUrl || data.signatureDataUrl;
        }
      }
    } catch (_) {}
  }

  // Fallback: Generate SVG calligraphic signature using their real name
  return generateCalligraphicSignature(step.signatoryName || 'STI Signatory', 'Institutional Endorsement');
}

/**
 * 1-Click Session Switcher / Impersonator:
 * Updates localStorage to instantly simulate being logged in as any real Firestore signatory.
 */
export function switchActiveSignatorySession(signatory: InstitutionalSignatory | any): void {
  const signatorySession = {
    uid: signatory.uid || signatory.id,
    id: signatory.id,
    name: signatory.name,
    email: signatory.email,
    role: signatory.role,
    roleTitle: signatory.roleTitle || signatory.title || 'Institutional Signatory',
    actionType: signatory.actionType || (signatory.role === 'school_president' ? 'approve' : 'endorse'),
    department: signatory.department || '',
    employeeId: signatory.employeeId || '',
    signatureUrl: signatory.signatureUrl || signatory.signatureDataUrl || generateCalligraphicSignature(signatory.name, signatory.roleTitle || ''),
    isSignatory: true,
    requiresPasswordChange: false,
    availableWorkspaces: {
      hasSignatory: true,
      hasOfficer: true,
      hasAdviser: signatory.role === 'adviser',
    },
  };

  localStorage.setItem('sti_sync_signatory_session', JSON.stringify(signatorySession));
  localStorage.setItem(
    'sti_sync_officer_session',
    JSON.stringify({
      ...signatorySession,
      studentName: signatory.name,
      activeRoleId: signatory.role,
    })
  );

  window.dispatchEvent(new Event('storage'));
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. DYNAMIC PROPOSAL SIGNING (FORM AP-01)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Signs a specific pending step on an Activity Proposal on behalf of the person assigned to that step.
 * Uses their real Firestore name, role, email, and real uploaded signature.
 */
export async function signProposalStep(
  proposalId: string,
  targetStep: {
    id?: string;
    signatoryUid?: string;
    signatoryEmail?: string;
    signatoryName: string;
    role: string;
    roleTitle?: string;
    actionType?: 'endorse' | 'approve';
    signatureUrl?: string;
  },
  remarks = ''
): Promise<{ success: boolean; isFullyApproved: boolean; signerName: string; stageAdvanced?: boolean }> {
  // Fetch real uploaded signature from Firestore
  const signatureUrl = await getRealUploadedSignature(targetStep);

  const signerPayload = {
    id: targetStep.signatoryUid || targetStep.id || '',
    uid: targetStep.signatoryUid || targetStep.id || '',
    name: targetStep.signatoryName,
    email: targetStep.signatoryEmail || '',
    role: targetStep.role,
    roleTitle: targetStep.roleTitle || '',
    actionType: targetStep.actionType || (targetStep.role === 'school_president' ? 'approve' : 'endorse'),
    signatureUrl,
  };

  const effectiveRemarks = remarks || `Signed and verified by ${targetStep.signatoryName} (${targetStep.roleTitle || targetStep.role}).`;

  const result = await endorseProposal(proposalId, signerPayload, effectiveRemarks);

  return {
    success: result.success,
    isFullyApproved: result.isFullyApproved,
    signerName: targetStep.signatoryName,
    stageAdvanced: result.stageAdvanced,
  };
}

/**
 * Sequentially signs ALL remaining steps in an Activity Proposal across all stages.
 * Strictly uses the real names and real uploaded signatures defined on each step.
 */
export async function signAllProposalSteps(proposalId: string): Promise<{ totalSigned: number; isFullyApproved: boolean }> {
  let isFullyApproved = false;
  let signedCount = 0;
  let iterations = 0;

  while (!isFullyApproved && iterations < 15) {
    const propRef = doc(db, PROPOSALS_COLLECTION, proposalId);
    const snap = await getDoc(propRef);
    if (!snap.exists()) break;

    const data = snap.data();
    if (data.status === 'approved' || data.status === 'approved_president') {
      isFullyApproved = true;
      break;
    }

    const chain: any[] = data.approvalChain || [];
    const currentStage = data.currentStageIndex ?? 1;

    // Find first pending step in current active stage
    const pendingStep = chain.find(
      (s) => (s.stageIndex ?? 1) === currentStage && (s.status === 'current' || s.status === 'waiting')
    );

    if (!pendingStep) {
      // If no steps pending in current stage, check if any future stage has pending steps
      const anyPending = chain.find((s) => s.status === 'current' || s.status === 'waiting');
      if (!anyPending) {
        isFullyApproved = true;
        break;
      }
      break;
    }

    const res = await signProposalStep(proposalId, pendingStep);
    signedCount++;
    isFullyApproved = res.isFullyApproved;
    iterations++;
  }

  return { totalSigned: signedCount, isFullyApproved };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. DYNAMIC LIQUIDATION SIGNING (FORM LF-01)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Signs a specific pending step on a Financial Liquidation Report.
 * Uses the real person assigned to that step and their real uploaded signature from Firestore.
 */
export async function signLiquidationStep(
  liquidationId: string,
  targetStep: {
    id?: string;
    signatoryUid?: string;
    signatoryEmail?: string;
    signatoryName: string;
    role: string;
    roleTitle?: string;
    actionType?: 'check' | 'endorse' | 'approve' | 'note';
    signatureUrl?: string;
  },
  remarks = ''
): Promise<{ success: boolean; isFullyApproved: boolean; signerName: string; stageAdvanced?: boolean }> {
  const signatureUrl = await getRealUploadedSignature(targetStep);

  const signerPayload = {
    id: targetStep.signatoryUid || targetStep.id || '',
    uid: targetStep.signatoryUid || targetStep.id || '',
    name: targetStep.signatoryName,
    email: targetStep.signatoryEmail || '',
    role: targetStep.role,
    roleTitle: targetStep.roleTitle || '',
    actionType: targetStep.actionType || (targetStep.role === 'school_president' ? 'approve' : 'endorse'),
    signatureUrl,
  };

  const effectiveRemarks = remarks || `Voucher and receipts audited and signed by ${targetStep.signatoryName}.`;

  const result = await endorseLiquidationStep(liquidationId, signerPayload, effectiveRemarks);

  return {
    success: result.success,
    isFullyApproved: result.isFullyApproved,
    signerName: targetStep.signatoryName,
    stageAdvanced: result.stageAdvanced,
  };
}

/**
 * Sequentially signs ALL remaining steps on a Financial Liquidation report.
 */
export async function signAllLiquidationSteps(liquidationId: string): Promise<{ totalSigned: number; isFullyApproved: boolean }> {
  let isFullyApproved = false;
  let signedCount = 0;
  let iterations = 0;

  while (!isFullyApproved && iterations < 15) {
    const liqRef = doc(db, LIQUIDATIONS_COLLECTION, liquidationId);
    const snap = await getDoc(liqRef);
    if (!snap.exists()) break;

    const data = snap.data();
    if (data.status === 'approved') {
      isFullyApproved = true;
      break;
    }

    const chain: any[] = data.approvalChain || [];
    const currentStage = data.currentStageIndex ?? 1;

    const pendingStep = chain.find(
      (s) => (s.stageIndex ?? 1) === currentStage && (s.status === 'current' || s.status === 'waiting')
    );

    if (!pendingStep) {
      const anyPending = chain.find((s) => s.status === 'current' || s.status === 'waiting');
      if (!anyPending) {
        isFullyApproved = true;
        break;
      }
      break;
    }

    const res = await signLiquidationStep(liquidationId, pendingStep);
    signedCount++;
    isFullyApproved = res.isFullyApproved;
    iterations++;
  }

  return { totalSigned: signedCount, isFullyApproved };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. DYNAMIC POST-ACTIVITY REPORT SIGNING (FORM PAR)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Signs a specific pending step on a Post-Activity Report.
 * Uses the real person assigned to that step and their real uploaded signature from Firestore.
 */
export async function signPARStep(
  parId: string,
  targetStep: {
    id?: string;
    signatoryUid?: string;
    signatoryEmail?: string;
    signatoryName: string;
    role: string;
    roleTitle?: string;
    signatureUrl?: string;
  },
  remarks = ''
): Promise<{ success: boolean; isFullyApproved: boolean; signerName: string; stageAdvanced?: boolean }> {
  const signatureUrl = await getRealUploadedSignature(targetStep);

  const signerPayload = {
    id: targetStep.signatoryUid || targetStep.id || '',
    uid: targetStep.signatoryUid || targetStep.id || '',
    name: targetStep.signatoryName,
    email: targetStep.signatoryEmail || '',
    role: targetStep.role,
    roleTitle: targetStep.roleTitle || '',
    signatureUrl,
  };

  const effectiveRemarks = remarks || `Post-Activity Report reviewed and endorsed by ${targetStep.signatoryName}.`;

  const result = await endorsePARStep(parId, signerPayload, effectiveRemarks);

  return {
    success: result.success,
    isFullyApproved: result.isFullyApproved,
    signerName: targetStep.signatoryName,
    stageAdvanced: result.stageAdvanced,
  };
}

/**
 * Sequentially signs ALL remaining steps on a Post-Activity Report.
 * Clears final approval and automatically archives the report into EDMS.
 */
export async function signAllPARSteps(parId: string): Promise<{ totalSigned: number; isFullyApproved: boolean }> {
  let isFullyApproved = false;
  let signedCount = 0;
  let iterations = 0;

  while (!isFullyApproved && iterations < 15) {
    const parRef = doc(db, PAR_COLLECTION, parId);
    const snap = await getDoc(parRef);
    if (!snap.exists()) break;

    const data = snap.data();
    if (data.status === 'approved') {
      isFullyApproved = true;
      break;
    }

    const chain: any[] = data.approvalChain || [];
    const currentStage = data.currentStageIndex ?? 1;

    const pendingStep = chain.find(
      (s) => (s.stageIndex ?? 1) === currentStage && (s.status === 'current' || s.status === 'waiting')
    );

    if (!pendingStep) {
      const anyPending = chain.find((s) => s.status === 'current' || s.status === 'waiting');
      if (!anyPending) {
        isFullyApproved = true;
        break;
      }
      break;
    }

    const res = await signPARStep(parId, pendingStep);
    signedCount++;
    isFullyApproved = res.isFullyApproved;
    iterations++;
  }

  return { totalSigned: signedCount, isFullyApproved };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. LIFECYCLE EVENT CREATOR & STEPPER (ZERO HARDCODED NAMES)
// ═══════════════════════════════════════════════════════════════════════════════

export interface SeedProposalOptions {
  title?: string;
  tagline?: string;
  description?: string;
  organizationId?: string;
  organizationName?: string;
  ticketFee?: number;
  expectedAttendees?: number;
}

/**
 * Creates an Activity Proposal whose approval chain is dynamically generated
 * from REAL institutional signatories in Firestore (zero hardcoded names).
 */
export async function seedLifecycleProposal(
  options: SeedProposalOptions = {}
): Promise<{ proposalId: string; referenceNo: string }> {
  const activeSignatories = await getInstitutionalSignatories();
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];

  const title = options.title || 'Tech Innovators Hackathon & Dev Summit 2026';
  const tagline = options.tagline || 'Building Next-Generation Digital Solutions for Community Impact';
  const description = options.description || 'Hands-on technological symposium and software development hackathon bringing together students for collaborative problem solving.';
  const orgId = options.organizationId || 'org_jpcs';
  const orgName = options.organizationName || 'Junior Philippine Computer Society';
  const ticketFee = options.ticketFee !== undefined ? options.ticketFee : 150;
  const expectedAttendees = options.expectedAttendees || 80;

  // Build dynamic approval chain using REAL signatories from Firestore
  const approvalChain = buildDynamicApprovalChain(
    {
      scope: 'all',
      allStudents: true,
      departments: ['Information Technology'],
      courseCodes: ['BSIT', 'BSCS'],
      estimatedAttendance: expectedAttendees,
    },
    activeSignatories,
    'Student Affairs & Services',
    false,
    false
  );

  const budgetItems: BudgetLineItem[] = [
    { id: 'b_1', item: 'Venue & Audio-Visual Equipment Rental', description: 'Sound system, projectors, and network switches', quantity: 1, unitCost: 1500, approvedAmount: 1500, status: 'approved' },
    { id: 'b_2', item: 'Resource Speaker Token & Honorarium', description: 'Guest speaker professional token and honorarium', quantity: 1, unitCost: 3000, approvedAmount: 3000, status: 'approved' },
    { id: 'b_3', item: 'Participant Badges & Materials', description: 'Participant badges and certificate stock', quantity: expectedAttendees, unitCost: 25, approvedAmount: expectedAttendees * 25, status: 'approved' },
  ];
  const totalApprovedBudget = budgetItems.reduce((acc, b) => acc + b.approvedAmount, 0);

  const sessions: EventSession[] = [
    {
      id: `sess_${Date.now()}_1`,
      title: 'Main Session & Keynote Workshop',
      date: dateStr,
      startTime: '08:00',
      endTime: '17:00',
      timeInOpen: '07:30',
      timeInClose: '09:30',
      hasTimeOut: true,
      timeOutOpen: '16:00',
      timeOutClose: '17:30',
    },
  ];

  const referenceNo = await generateProposalReferenceNumber('ORG');
  const proposalId = `test_prop_${Date.now()}_${Math.floor(100 + Math.random() * 900)}`;

  const proposalData: any = {
    id: proposalId,
    referenceNo,
    title,
    tagline,
    description,
    objectives: [
      'Foster student innovation, collaboration, and applied software development.',
      'Provide practical experiential learning aligned with industry standards.',
      'Encourage student engagement across institutional academic programs.',
    ],
    status: 'under_review',
    proposalStatus: 'under_review',
    currentStageIndex: 1,
    currentStepIndex: 0,
    isOfficerProposal: true,
    creatorRole: 'officer',
    createdByUid: 'dev_test_officer',
    createdByName: 'Student Organization Officer',
    createdByEmail: 'officer@ormoc.sti.edu.ph',
    organizationId: orgId,
    hostingOrgId: orgId,
    organizationName: orgName,
    academicTrack: 'COLLEGE',
    academicLevel: 'COLLEGE',
    semester: '1st Semester',
    schoolYear: '2026-2027',
    startDate: dateStr,
    endDate: dateStr,
    startTime: '08:00',
    endTime: '17:00',
    venueName: 'STI Ormoc Gymnasium & Innovation Hub',
    venueId: 'venue_gym',
    customVenueName: 'STI Ormoc Gymnasium & Innovation Hub',
    eventFormat: 'On-Campus',
    expectedParticipantCount: expectedAttendees,
    expectedAttendees,
    actualAttendees: 0,
    attendeesCount: 0,
    attendanceEnabled: true,
    minAttendancePercent: 80,
    studentPayablesEnabled: ticketFee > 0,
    suggestedFeePerStudent: ticketFee,
    adminFeeOverride: ticketFee,
    totalExpectedCollection: ticketFee * expectedAttendees,
    sessions,
    budgetItems,
    totalApprovedBudget,
    approvalChain,
    isTestData: true,
  };

  const userContext = {
    uid: proposalData.createdByUid,
    name: proposalData.createdByName,
    email: proposalData.createdByEmail,
    role: proposalData.creatorRole,
    organizationId: orgId,
  };

  await submitProposalForReview(proposalData, userContext, proposalId);

  return { proposalId, referenceNo };
}

/**
 * Concludes an event to satisfy the gatekeeper for Financial Liquidation.
 */
export async function concludeLifecycleEvent(eventId: string): Promise<void> {
  const updates = {
    lifecycleStatus: 'completed',
    status: 'Completed',
    isConcluded: true,
    concludedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await updateDoc(doc(db, 'activities', eventId), updates);
  } catch (_) {}

  try {
    await updateDoc(doc(db, 'events', eventId), updates);
  } catch (_) {}
}

/**
 * Creates a Financial Liquidation Report whose approval chain is dynamically generated
 * from REAL institutional signatories in Firestore (zero hardcoded names).
 */
export async function seedLifecycleLiquidation(
  eventId: string
): Promise<{ liquidationId: string; referenceNo: string }> {
  const activeSignatories = await getInstitutionalSignatories();

  let eventDocData: any = null;
  const actSnap = await getDoc(doc(db, 'activities', eventId));
  if (actSnap.exists()) eventDocData = actSnap.data();
  else {
    const evtSnap = await getDoc(doc(db, 'events', eventId));
    if (evtSnap.exists()) eventDocData = evtSnap.data();
  }

  if (!eventDocData) throw new Error('Event not found.');

  // Auto-conclude if needed
  if (eventDocData.lifecycleStatus !== 'completed' && eventDocData.status !== 'Completed') {
    await concludeLifecycleEvent(eventId);
  }

  const allocatedBudget = Number(eventDocData.totalApprovedBudget || 6500);
  const now = new Date();
  const yearStr = now.getFullYear().toString();
  const dateStr = now.toISOString().split('T')[0];

  const lineItems = [
    {
      id: 'li_1',
      category: 'Venue & Setup',
      particulars: 'Audio-Visual Sound Equipment Rental',
      quantity: 1,
      unitCost: 1500,
      totalCost: 1500,
      orNumber: `OR-${yearStr}-${Math.floor(1000 + Math.random() * 9000)}`,
      receiptDate: dateStr,
      supplierName: 'SoundWave Solutions Ormoc',
      receiptAttachmentUrl: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=800&q=80',
    },
    {
      id: 'li_2',
      category: 'Honorarium',
      particulars: 'Resource Speaker Professional Honorarium',
      quantity: 1,
      unitCost: 3000,
      totalCost: 3000,
      orNumber: `AR-${yearStr}-${Math.floor(1000 + Math.random() * 9000)}`,
      receiptDate: dateStr,
      supplierName: 'Industry Consultant Services',
      receiptAttachmentUrl: 'https://images.unsplash.com/photo-1450133064473-71024230f91b?auto=format&fit=crop&w=800&q=80',
    },
    {
      id: 'li_3',
      category: 'Materials',
      particulars: 'Participant RFID Cards & Printing Stock',
      quantity: 80,
      unitCost: 25,
      totalCost: 2000,
      orNumber: `OR-${yearStr}-${Math.floor(1000 + Math.random() * 9000)}`,
      receiptDate: dateStr,
      supplierName: 'Commercial Press Ormoc',
      receiptAttachmentUrl: 'https://images.unsplash.com/photo-1554224154-26032ffc0d07?auto=format&fit=crop&w=800&q=80',
    },
  ];

  const totalActualSpending = lineItems.reduce((acc, item) => acc + item.totalCost, 0);
  const surplusOrDeficit = allocatedBudget - totalActualSpending;

  // Build dynamic chain from real Firestore signatories
  const approvalChain = await generateDefaultLiquidationChain(
    eventDocData.hostingOrgId || 'org_jpcs',
    eventDocData.organizationName || 'Student Organization',
    allocatedBudget,
    activeSignatories
  );

  const referenceNo = `LF-${yearStr}-${Math.floor(100 + Math.random() * 900)}`;

  const liquidationPayload: any = {
    referenceNo,
    eventId,
    eventTitle: eventDocData.title,
    eventReferenceId: eventDocData.referenceId || `EVT-${yearStr}-001`,
    organizationId: eventDocData.hostingOrgId || 'org_jpcs',
    organizationName: eventDocData.organizationName || 'Student Organization',
    allocatedBudget,
    totalActualSpending,
    surplusOrDeficit,
    status: 'under_review',
    currentStageIndex: 1,
    currentStepIndex: 0,
    lineItems,
    approvalChain,
    createdByUid: 'dev_test_officer',
    createdByName: 'Student Organization Officer',
    createdByEmail: 'officer@ormoc.sti.edu.ph',
    createdByRole: 'officer',
    submissionDate: dateStr,
    isTestData: true,
  };

  const liquidationId = await createLiquidationReport(liquidationPayload);

  const eventUpdate = {
    liquidationStatus: 'under_review',
    liquidationId,
    updatedAt: serverTimestamp(),
  };
  try {
    await updateDoc(doc(db, 'activities', eventId), eventUpdate);
  } catch (_) {}
  try {
    await updateDoc(doc(db, 'events', eventId), eventUpdate);
  } catch (_) {}

  return { liquidationId, referenceNo };
}

/**
 * Creates a Post-Activity Report whose approval chain is dynamically generated
 * from REAL institutional signatories in Firestore (zero hardcoded names).
 */
export async function seedLifecyclePAR(
  eventId: string
): Promise<{ parId: string; referenceNo: string }> {
  const activeSignatories = await getInstitutionalSignatories();

  let eventDocData: any = null;
  const actSnap = await getDoc(doc(db, 'activities', eventId));
  if (actSnap.exists()) eventDocData = actSnap.data();
  else {
    const evtSnap = await getDoc(doc(db, 'events', eventId));
    if (evtSnap.exists()) eventDocData = evtSnap.data();
  }

  if (!eventDocData) throw new Error('Event not found.');

  if (eventDocData.lifecycleStatus !== 'completed' && eventDocData.status !== 'Completed') {
    await concludeLifecycleEvent(eventId);
  }
  if (eventDocData.liquidationStatus !== 'approved') {
    const liqRes = await seedLifecycleLiquidation(eventId);
    await signAllLiquidationSteps(liqRes.liquidationId);
  }

  const isSasEvent =
    eventDocData.isOfficerProposal === false ||
    eventDocData.creatorRole === 'sas_admin' ||
    eventDocData.hostingOrgId === 'sas' ||
    !eventDocData.hostingOrgId;

  const userContext = isSasEvent
    ? {
        uid: 'dev_test_sas',
        name: 'SAS Coordinator',
        email: 'sas.admin@ormoc.sti.edu.ph',
        role: 'sas_admin',
      }
    : {
        uid: 'dev_test_officer',
        name: 'Student Organization Officer',
        email: 'officer@ormoc.sti.edu.ph',
        role: 'officer',
        organizationId: eventDocData.hostingOrgId || 'org_jpcs',
      };

  // Build dynamic PAR chain from real Firestore signatories
  const approvalChain = await generateDefaultPARSignatoryChain(
    eventDocData.hostingOrgId,
    activeSignatories
  );

  const parFormData: any = {
    eventId,
    eventTitle: eventDocData.title,
    objectivesAchievement: 'fully_achieved',
    accomplishments:
      'The activity was successfully completed. Participants actively engaged in practical demonstrations, team exercises, and achieved core learning outcomes.',
    learnings: [
      'Early pre-configuration of equipment and testing prevented technical delays.',
      'Automated attendance tracking via STI Sync mobile QR scanning ensured 100% verified gate records.',
      'Peer collaboration fostered deeper learning retention among participants.',
    ],
    curriculumEnrichment:
      'Directly enhanced foundational subject competencies and experiential leadership skills.',
    recommendations: {
      programFlow: 'Maintain dedicated 15-minute buffers between technical workshop segments for Q&A.',
      participantEngagement: 'Incorporate live interactive polling and gamified leaderboards during presentations.',
      technicalSetup: 'Coordinate laboratory workstation testing with network administrators 24 hours prior.',
      participantPreparedness: 'Send event preparation guidelines to participants 48 hours ahead of time.',
    },
    photos: [
      {
        id: 'photo_1',
        url: 'https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=800&q=80',
        caption: 'Speaker delivering presentation to participants in Gymnasium',
        uploadedAt: new Date().toISOString(),
      },
      {
        id: 'photo_2',
        url: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=800&q=80',
        caption: 'Hands-on team workshop and interactive problem solving',
        uploadedAt: new Date().toISOString(),
      },
    ],
    approvalChain,
    isTestData: true,
  };

  const result = await saveOrSubmitPAR(parFormData, userContext, false);

  return { parId: result.id, referenceNo: result.referenceNo };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6. STUDENT, ATTENDANCE & PAYABLES INJECTION HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

export function isStudentEligibleForEvent(event: Partial<EventDocument> | any, student: Partial<StudentDocument> | any): boolean {
  if (!event || !student) return false;

  const isShsEvent =
    event.academicLevel === 'SHS' ||
    String(event.semester || '').includes('Trimester') ||
    (event.targetYearLevels || []).some((y: string) => y.includes('Grade 11') || y.includes('Grade 12'));

  const isShsStudent =
    student.academicLevel === 'SHS' ||
    String(student.semester || '').includes('Trimester') ||
    String(student.yearLevel || '').includes('Grade');

  if (isShsEvent !== isShsStudent) return false;

  const scope = event.targetAudienceScope || event.targetAudience || 'all';
  const targetCourses: string[] = (event.targetCourses || event.targetCourseIds || []).map((c: string) => String(c).trim().toLowerCase());
  const targetYearLevels: string[] = (event.targetYearLevels || []).map((y: string) => String(y).trim().toLowerCase());
  const targetSections: string[] = (event.targetSections || event.targetSectionNames || []).map((s: string) => String(s).trim().toLowerCase());

  const hasSpecificTargets = targetCourses.length > 0 || targetYearLevels.length > 0 || targetSections.length > 0;
  if (scope === 'all' && !hasSpecificTargets) return true;

  const studentCourseCode = String(student.courseCode || '').trim().toLowerCase();
  const studentCourseId = String(student.courseId || '').trim().toLowerCase();
  const matchesCourse =
    targetCourses.length === 0 ||
    (studentCourseCode && targetCourses.includes(studentCourseCode)) ||
    (studentCourseId && targetCourses.includes(studentCourseId));

  const studentYear = String(student.yearLevel || '').trim().toLowerCase();
  const matchesYear = targetYearLevels.length === 0 || (studentYear && targetYearLevels.includes(studentYear));

  const studentSection = String(student.section || '').trim().toLowerCase();
  const matchesSection = targetSections.length === 0 || (studentSection && targetSections.includes(studentSection));

  return matchesCourse && matchesYear && matchesSection;
}

export interface SeedStudentOptions {
  count: number;
  track?: 'COLLEGE' | 'SHS' | 'MIXED';
  courseCode?: string;
  yearLevel?: StudentYearLevel;
  section?: string;
  schoolYear?: string;
  semester?: StudentSemester;
}

const FIRST_NAMES_MALE = [
  'Juan', 'Mark', 'Joshua', 'Christian', 'Angelo', 'Gabriel', 'John Paul', 'Kenneth', 'Daniel',
  'Jayson', 'Carl', 'Justin', 'Matthew', 'Nathaniel', 'Lance', 'Vince', 'Paolo', 'Rafael',
];
const FIRST_NAMES_FEMALE = [
  'Maria', 'Angelica', 'Bea', 'Christine', 'Nicole', 'Patricia', 'Alyssa', 'Camille', 'Samantha',
  'Katrina', 'Andrea', 'Princess', 'Denise', 'Hannah', 'Erika', 'Kimberly', 'Rhea', 'Danica',
];
const LAST_NAMES = [
  'Dela Cruz', 'Santos', 'Reyes', 'Fernandez', 'Gonzales', 'Concordia', 'Lucanas', 'Mendoza',
  'Garcia', 'Flores', 'Villanueva', 'Bautista', 'Torres', 'Navarro', 'Castillo', 'Alvarez',
];

export async function seedSampleStudents(options: SeedStudentOptions): Promise<StudentDocument[]> {
  const { count = 10, track = 'COLLEGE', courseCode, yearLevel, section } = options;
  const createdStudents: StudentDocument[] = [];
  const now = Timestamp.now();

  for (let i = 0; i < count; i++) {
    const isMale = Math.random() > 0.5;
    const firstName = isMale
      ? FIRST_NAMES_MALE[Math.floor(Math.random() * FIRST_NAMES_MALE.length)]
      : FIRST_NAMES_FEMALE[Math.floor(Math.random() * FIRST_NAMES_FEMALE.length)];
    const lastName = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];

    const selectedTrack: AcademicLevel = track === 'MIXED' ? (Math.random() > 0.5 ? 'COLLEGE' : 'SHS') : track;
    const resolvedCourse = courseCode || (selectedTrack === 'COLLEGE' ? 'BSIT' : 'STEM');
    const selectedYear: StudentYearLevel =
      yearLevel ||
      (selectedTrack === 'COLLEGE'
        ? (['1st Year', '2nd Year', '3rd Year', '4th Year'][Math.floor(Math.random() * 4)] as StudentYearLevel)
        : (['Grade 11', 'Grade 12'][Math.floor(Math.random() * 2)] as StudentYearLevel));

    const selectedSection = section || `${resolvedCourse} 101`;
    const randomSuffix = Math.floor(100000 + Math.random() * 900000);
    const studentIdNumber = `02000${randomSuffix}`;
    const docId = `test_std_${studentIdNumber}`;

    const studentDoc = cleanForFirestore<StudentDocument>({
      id: docId,
      studentId: studentIdNumber,
      firstName,
      lastName,
      middleName: 'D.',
      dateOfBirth: '2004-05-15',
      sex: isMale ? 'Male' : 'Female',
      contactNumber: `09${Math.floor(100000000 + Math.random() * 900000000)}`,
      academicLevel: selectedTrack,
      courseId: `course_${resolvedCourse.toLowerCase()}`,
      courseCode: resolvedCourse,
      courseName: resolvedCourse === 'BSIT' ? 'Bachelor of Science in Information Technology' : 'Academic Strand',
      departmentId: 'dept_it',
      departmentName: 'Information Technology',
      yearLevel: selectedYear,
      section: selectedSection,
      schoolYear: options.schoolYear || '2026-2027',
      semester: options.semester || '1st Semester',
      term: options.semester || '1st Semester',
      email: `${firstName.toLowerCase().replace(/\s+/g, '')}.${lastName.toLowerCase().replace(/\s+/g, '')}${Math.floor(Math.random() * 999)}@ormoc.sti.edu.ph`,
      authUid: `auth_${docId}`,
      requiresPasswordChange: false,
      profilePhotoUrl: '',
      schoolIdPhotoUrl: '',
      status: 'ACTIVE',
      registrationSource: 'MANUAL',
      addedBy: 'dev_test_seeder',
      createdAt: now,
      updatedAt: now,
      isTestData: true,
    } as any);

    await setDoc(doc(db, 'students', docId), studentDoc);
    createdStudents.push(studentDoc);
  }

  return createdStudents;
}

export interface SeedAttendanceOptions {
  event: EventDocument;
  students: StudentDocument[];
  sessionId?: string;
  attendanceRate?: number;
  scannerName?: string;
  strictTargeting?: boolean;
}

export async function seedEventAttendance(options: SeedAttendanceOptions): Promise<{
  totalInjected: number;
  attendees: number;
  sessionsCount: number;
  skippedNonTargeted: number;
}> {
  const { event, students, sessionId = 'ALL', attendanceRate = 85, scannerName = 'Lead Gate Scanner', strictTargeting = true } = options;
  if (!event || !event.id) throw new Error('Valid Event is required for attendance seeding.');

  const eligibleStudents = strictTargeting ? students.filter((s) => isStudentEligibleForEvent(event, s)) : students;
  const skippedCount = students.length - eligibleStudents.length;

  if (eligibleStudents.length === 0) {
    throw new Error('No students matched event criteria. Generate students first!');
  }

  const eventSessions: EventSession[] = event.sessions && event.sessions.length > 0 ? event.sessions : [
    {
      id: 'sess_main',
      title: 'Main Session',
      date: new Date().toISOString().split('T')[0],
      startTime: '08:00',
      endTime: '12:00',
      timeInOpen: '07:30',
      timeInClose: '09:00',
      hasTimeOut: true,
      timeOutOpen: '11:30',
      timeOutClose: '12:30',
    },
  ];

  const sessionsToProcess = sessionId === 'ALL' ? eventSessions : eventSessions.filter((s) => s.id === sessionId);
  let totalInjected = 0;
  const uniqueAttendees = new Set<string>();

  for (const session of sessionsToProcess) {
    const sessionDate = session.date ? new Date(session.date) : new Date();
    const hasTimeOut = session.hasTimeOut !== false;

    for (const student of eligibleStudents) {
      const isAttending = Math.random() * 100 <= attendanceRate;
      const isLate = isAttending && Math.random() < 0.15;

      let status: AttendanceStatus;
      if (!isAttending) status = 'Absent';
      else if (isLate) status = 'Late';
      else if (!hasTimeOut) status = 'Checked In';
      else status = 'Complete';

      if (isAttending) uniqueAttendees.add(student.studentId);

      const checkInStr = isAttending ? '08:15 AM' : '—';
      const checkOutStr = hasTimeOut && isAttending ? '12:05 PM' : '—';

      const recordId = `test_att_${event.id}_${session.id}_${student.studentId}`;
      const recordData = cleanForFirestore<any>({
        id: recordId,
        studentId: student.studentId || '',
        name: `${student.lastName || ''}, ${student.firstName || ''}`.trim(),
        studentSchoolId: student.studentId || '',
        studentName: `${student.lastName || ''}, ${student.firstName || ''}`.trim(),
        courseCode: student.courseCode || '',
        yearLevel: student.yearLevel || '',
        section: student.section || '',
        org: event.hostingOrgId || 'org_jpcs',
        eventId: event.id,
        event: event.title,
        eventName: event.title,
        sessionId: session.id,
        sessionTitle: session.title || 'Main Session',
        hasTimeOut,
        checkIn: checkInStr,
        checkOut: checkOutStr,
        status,
        scannedBy: 'dev_scanner_uid',
        scannedByName: scannerName,
        createdAt: Timestamp.fromDate(sessionDate),
        scannedAt: Timestamp.fromDate(sessionDate),
        isTestData: true,
      });

      await Promise.all([
        setDoc(doc(db, ATTENDANCE_COLLECTION, recordId), recordData),
        setDoc(doc(db, 'activities', event.id, 'attendance_logs', recordId), recordData),
      ]);

      totalInjected++;
    }
  }

  const totalActual = uniqueAttendees.size;
  try {
    await updateDoc(doc(db, 'activities', event.id), {
      actualAttendees: totalActual,
      attendeesCount: totalActual,
      updatedAt: serverTimestamp(),
    });
  } catch (_) {}

  try {
    await updateDoc(doc(db, 'events', event.id), {
      actualAttendees: totalActual,
      attendeesCount: totalActual,
      updatedAt: serverTimestamp(),
    });
  } catch (_) {}

  return {
    totalInjected,
    attendees: totalActual,
    sessionsCount: sessionsToProcess.length,
    skippedNonTargeted: skippedCount,
  };
}

export interface SeedPayablesOptions {
  organizationId: string;
  organizationName: string;
  students: StudentDocument[];
  title: string;
  amount: number;
  type: PayableType;
  eventId?: string;
  paidPercentage?: number;
}

export async function seedPayables(options: SeedPayablesOptions): Promise<{ total: number; paid: number; unpaid: number }> {
  const { organizationId, organizationName, students, title, amount = 150, type = 'event_fee', eventId, paidPercentage = 75 } = options;
  let paidCount = 0;
  let unpaidCount = 0;
  const now = Timestamp.now();

  for (const student of students) {
    const isPaid = Math.random() * 100 <= paidPercentage;
    if (isPaid) paidCount++;
    else unpaidCount++;

    const docId = `test_pay_${student.studentId}_${type}_${Math.floor(Math.random() * 9999)}`;
    const payDoc = cleanForFirestore<any>({
      id: docId,
      studentId: student.studentId || '',
      studentName: `${student.lastName || ''}, ${student.firstName || ''}`.trim(),
      studentSchoolId: student.studentId || '',
      organizationId,
      organizationName,
      title,
      feeTitle: title,
      type,
      amount: Number(amount) || 0,
      status: isPaid ? 'paid' : 'pending',
      paymentStatus: isPaid ? 'PAID' : 'UNPAID',
      paidAmount: isPaid ? Number(amount) : 0,
      assignedAmount: Number(amount) || 0,
      paidAt: isPaid ? now : null,
      paymentMethod: isPaid ? 'cash' : null,
      eventId: eventId || null,
      courseCode: student.courseCode || '',
      yearLevel: student.yearLevel || '',
      section: student.section || '',
      academicLevel: student.academicLevel || 'COLLEGE',
      schoolYear: student.schoolYear || '2026-2027',
      semester: student.semester || '1st Semester',
      createdAt: now,
      updatedAt: now,
      isTestData: true,
    });

    await setDoc(doc(db, PAYABLES_COLLECTION, docId), payDoc);
  }

  return { total: students.length, paid: paidCount, unpaid: unpaidCount };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 7. COMPLETE TEST DATA PURGE
// ═══════════════════════════════════════════════════════════════════════════════

export async function clearAllTestData(): Promise<{
  students: number;
  events: number;
  attendance: number;
  payables: number;
  proposals: number;
  liquidations: number;
  pars: number;
  documents: number;
}> {
  let studentCount = 0;
  let eventCount = 0;
  let attCount = 0;
  let payCount = 0;
  let propCount = 0;
  let liqCount = 0;
  let parCount = 0;
  let docCount = 0;

  // 1. Students
  const stdSnap = await getDocs(query(collection(db, 'students'), where('isTestData', '==', true)));
  for (const d of stdSnap.docs) {
    await deleteDoc(d.ref);
    studentCount++;
  }

  // 2. Activities & Events
  const actSnap = await getDocs(query(collection(db, 'activities'), where('isTestData', '==', true)));
  for (const d of actSnap.docs) {
    await deleteDoc(d.ref);
    eventCount++;
  }
  const evtSnap = await getDocs(query(collection(db, 'events'), where('isTestData', '==', true)));
  for (const d of evtSnap.docs) {
    await deleteDoc(d.ref);
  }

  // 3. Attendance
  const attSnap = await getDocs(query(collection(db, ATTENDANCE_COLLECTION), where('isTestData', '==', true)));
  for (const d of attSnap.docs) {
    await deleteDoc(d.ref);
    attCount++;
  }

  // 4. Payables
  const paySnap = await getDocs(query(collection(db, PAYABLES_COLLECTION), where('isTestData', '==', true)));
  for (const d of paySnap.docs) {
    await deleteDoc(d.ref);
    payCount++;
  }

  // 5. Liquidations
  const liqSnap = await getDocs(query(collection(db, LIQUIDATIONS_COLLECTION), where('isTestData', '==', true)));
  for (const d of liqSnap.docs) {
    await deleteDoc(d.ref);
    liqCount++;
  }

  // 6. Post-Activity Reports
  const parSnap = await getDocs(query(collection(db, PAR_COLLECTION), where('isTestData', '==', true)));
  for (const d of parSnap.docs) {
    await deleteDoc(d.ref);
    parCount++;
  }

  // 7. EDMS Documents
  const docSnap = await getDocs(query(collection(db, DOCUMENTS_COLLECTION), where('isTestData', '==', true)));
  for (const d of docSnap.docs) {
    await deleteDoc(d.ref);
    docCount++;
  }

  return {
    students: studentCount,
    events: eventCount,
    attendance: attCount,
    payables: payCount,
    proposals: propCount,
    liquidations: liqCount,
    pars: parCount,
    documents: docCount,
  };
}
