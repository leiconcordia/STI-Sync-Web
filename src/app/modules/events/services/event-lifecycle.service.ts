/**
 * src/app/modules/events/services/event-lifecycle.service.ts
 *
 * Handles advanced operational lifecycle workflows for events:
 * 1. Concluding / Marking Completed (Locks attendance scanners & gate check-ins)
 * 2. Soft-deleting archived events (Safe trash with indefinite retention until restored or purged)
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  serverTimestamp,
  writeBatch,
  arrayUnion,
  Timestamp,
} from 'firebase/firestore';

import { db } from '../../../../services/firebase';
import { EVENTS_COLLECTION } from './event.service';
import { PAYABLES_COLLECTION } from '../../finance/services/payable.service';
import { logAuditEvent } from '../../audit/services/audit.service';
import { finalizeEventAttendance } from '../../attendance/services/attendance.service';
import { reconcilePendingMemberRemovalsForOrg } from '../../organizations/services/member.service';
import type { EventDocument, EventProposalHistoryLog } from '../types/event.types';
import { getEventTimingStatus, areEventSessionsOver, canConcludeEvent, isEventAttendanceEnabled } from '../utils/event-lifecycle.utils';
import {
  addCalendarDays,
  campusDateKey,
  LIQUIDATION_SUBMISSION_DAYS,
  PAR_SUBMISSION_DAYS,
} from '../utils/activity-compliance.utils';
import { isEventLiquidationExempt } from '../utils/organization-display.utils';

export interface ConcludeEventOptions {
  note?: string;
  finalizeAttendance?: boolean;
  forceConclude?: boolean;
  targetedStudents?: any[];
  rawOrganizations?: any[];
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), timeoutMs)),
  ]);
}

function cleanUndefined<T extends Record<string, any>>(obj: T): T {
  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Marks an event as officially Concluded / Completed.
 * 1. Locks the live attendance scanner.
 * 2. If finalizeAttendance is requested, marks all non-attendees as Absent (both time-in & time-out)
 *    and completes any unfinished check-outs.
 * 3. Locks cash advance custodian allocations into read-only mode for audit integrity.
 * 4. Determines whether financial liquidation is compulsory (required if budget > 0 or has cash custodians).
 */
export async function concludeEvent(
  eventId: string,
  adminUid: string,
  adminName?: string,
  optionsOrNote?: string | ConcludeEventOptions
): Promise<{ absenteesCount: number; liquidationRequired: boolean }> {
  const options: ConcludeEventOptions =
    typeof optionsOrNote === 'string'
      ? { note: optionsOrNote, finalizeAttendance: true }
      : { finalizeAttendance: true, ...(optionsOrNote || {}) };

  // Fetch document with fallback to 'events' or 'activities'
  let eventRef = doc(db, EVENTS_COLLECTION, eventId);
  let snap = await getDoc(eventRef).catch(() => null);

  if (!snap || !snap.exists()) {
    const fallbackRef = doc(db, 'events', eventId);
    const fallbackSnap = await getDoc(fallbackRef).catch(() => null);
    if (fallbackSnap && fallbackSnap.exists()) {
      eventRef = fallbackRef;
      snap = fallbackSnap;
    } else {
      throw new Error('Event not found.');
    }
  }

  const eventData = snap.data() as EventDocument;

  if (eventData.isArchived) {
    throw new Error('Archived events cannot be modified.');
  }

  // Enforce lifecycle state validation (already completed, cancelled, rejected, or unapproved cannot be concluded)
  const baseStatus = (eventData.status || eventData.proposalStatus || '').toLowerCase();
  if (baseStatus === 'completed' || (eventData as any).isConcluded) {
    throw new Error('This event is already marked as completed.');
  }
  if (baseStatus === 'cancelled' || eventData.isCancelled) {
    throw new Error('Cancelled events cannot be concluded.');
  }
  if (baseStatus === 'rejected') {
    throw new Error('Rejected proposals cannot be concluded.');
  }

  // Enforce session completion validation (bypass if forceConclude is explicitly requested)
  if (!options.forceConclude) {
    const concludeCheck = canConcludeEvent(eventData);
    if (!concludeCheck.canConclude) {
      throw new Error(
        concludeCheck.reason ||
          'Cannot conclude event: Scheduled sessions are not over yet. All sessions must end before concluding.'
      );
    }
  }

  const usesAttendance = isEventAttendanceEnabled(eventData);
  const shouldFinalizeAttendance = usesAttendance && options.finalizeAttendance !== false;

  // Determine financial liquidation requirement
  const totalApprovedBudget =
    Number(eventData.totalApprovedBudget || 0) ||
    Number(eventData.approvedBudget || 0) ||
    Number(eventData.totalBudget || 0) ||
    (eventData.budgetItems || []).reduce(
      (sum, bi) =>
        sum +
        Number(
          bi.approvedAmount ||
            bi.totalCost ||
            Number(bi.quantity || 1) * Number(bi.unitCost || 0) ||
            0
        ),
      0
    );
  const hasCashCustodians =
    Array.isArray(eventData.budgetCustodians) &&
    eventData.budgetCustodians.some((c) => Number(c.allocatedAmount || 0) > 0);

  const isExempt = isEventLiquidationExempt(eventData);
  const isLiquidationRequired = !isExempt && (totalApprovedBudget > 0 || hasCashCustodians);

  // Finalize attendance ONLY if event actually uses attendance and finalization is requested
  let absenteesCount = 0;
  if (shouldFinalizeAttendance) {
    try {
      const attResult = await withTimeout(
        finalizeEventAttendance(
          { ...eventData, id: eventId },
          options.targetedStudents,
          options.rawOrganizations
        ),
        7000,
        { absenteesCreated: 0, incompleteCheckoutsMarked: 0 }
      );
      absenteesCount = attResult.absenteesCreated;
    } catch (attErr) {
      console.warn('[concludeEvent] Non-fatal attendance finalization notice:', attErr);
    }
  }

  const historyEntry: EventProposalHistoryLog = cleanUndefined({
    id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    action: 'completed',
    performedBy: adminUid || 'administrator',
    performedByName: adminName || 'Administrator',
    performedAt: Timestamp.now(),
    reason:
      options.note ||
      (options.forceConclude
        ? 'Concluded early ahead of scheduled end. Event officially closed.'
        : usesAttendance
          ? 'All sessions concluded. Event officially closed and attendance sealed.'
          : 'Activity schedule concluded and officially closed.'),
  });

  const concludedDateKey = campusDateKey(new Date());
  const parDeadlineKey = addCalendarDays(concludedDateKey, PAR_SUBMISSION_DAYS);
  const liquidationDeadlineKey = isLiquidationRequired
    ? addCalendarDays(concludedDateKey, LIQUIDATION_SUBMISSION_DAYS)
    : undefined;

  const existingLiqStatus = String((eventData as any).liquidationStatus || '').toLowerCase();
  const hasExistingActiveLiquidation =
    Boolean((eventData as any).liquidationReportId) &&
    ['draft', 'returned', 'under_review', 'approved'].includes(existingLiqStatus);

  const updatePayload = cleanUndefined({
    status: 'completed',
    proposalStatus: 'completed',
    lifecycleStatus: 'completed',
    concludedAt: serverTimestamp(),
    concludedDate: concludedDateKey,
    completedAt: serverTimestamp(),
    completedBy: adminUid || 'administrator',
    completedByName: adminName || 'Administrator',
    parDeadline: parDeadlineKey || undefined,
    liquidationDeadline: liquidationDeadlineKey,
    attendanceLocked: usesAttendance ? true : undefined,
    attendanceFinalized: shouldFinalizeAttendance,
    scannerStatus: usesAttendance ? 'concluded' : undefined,
    scannerAssignmentStatus: usesAttendance ? 'concluded' : undefined,
    cashAllocationsLocked: true,
    liquidationRequired: isLiquidationRequired,
    liquidationStatus: !isLiquidationRequired
      ? 'none_required'
      : hasExistingActiveLiquidation
      ? existingLiqStatus
      : 'pending',
    absenteesMarkedCount: absenteesCount,
    updatedAt: serverTimestamp(),
    proposalHistory: arrayUnion(historyEntry),
  });

  // Concurrently update across both activities and events collections
  await Promise.allSettled([
    updateDoc(doc(db, 'activities', eventId), updatePayload),
    updateDoc(doc(db, 'events', eventId), updatePayload),
  ]);

  // Finalize any scheduled club member removals whose activity has now ended
  const concludedOrgId = String(eventData.hostingOrgId || (eventData as any).organizationId || '').trim();
  if (concludedOrgId && !['sas', 'sas_admin', 'sao', 'admin'].includes(concludedOrgId.toLowerCase())) {
    reconcilePendingMemberRemovalsForOrg(concludedOrgId).catch((err) => {
      console.warn('[concludeEvent] Scheduled removal reconciliation warning:', err);
    });
  }

  try {
    await logAuditEvent({
      action: 'CONCLUDE_EVENT',
      actionType: 'UPDATE',
      details: `Event "${eventData.title || eventId}" was marked as completed. Attendance finalized: ${
        options.finalizeAttendance !== false ? 'Yes' : 'No'
      }, Absentees marked: ${absenteesCount}, Cash allocations locked: Yes, Liquidation compulsory: ${
        isLiquidationRequired ? 'Yes' : 'No (Zero budget)'
      } by ${adminName || 'Admin'}.`,
      performedBy: adminName || 'Admin',
      userRole: 'SAO Admin',
      targetId: eventId,
      targetName: eventData.title || 'Event',
    });
  } catch (auditErr) {
    console.warn('[concludeEvent] Non-critical audit log failure:', auditErr);
  }

  return {
    absenteesCount,
    liquidationRequired: isLiquidationRequired,
  };
}

/**
 * Soft-deletes an already archived event.
 * Moves to Archive Center Trash with indefinite retention until restored or purged.
 */
export async function softDeleteArchivedEvent(
  eventId: string,
  adminUid: string,
  adminName?: string,
  reason?: string
): Promise<void> {
  const eventRef = doc(db, EVENTS_COLLECTION, eventId);
  const snap = await getDoc(eventRef);

  if (!snap.exists()) {
    throw new Error('Event not found.');
  }

  const eventData = snap.data() as EventDocument;

  if (!eventData.isArchived) {
    throw new Error('Only archived events can be deleted. Please archive the event first.');
  }

  const historyEntry: EventProposalHistoryLog = {
    id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    action: 'deleted',
    performedBy: adminUid,
    performedByName: adminName || 'Administrator',
    performedAt: new Date(),
    reason: reason || 'Archived event sent to Archive Center Trash.',
  };

  await updateDoc(eventRef, {
    isDeleted: true,
    deletedAt: serverTimestamp(),
    deletedBy: adminUid,
    deletedByName: adminName || 'Administrator',
    deleteReason: reason || 'Soft-deleted from archive.',
    updatedAt: serverTimestamp(),
    proposalHistory: arrayUnion(historyEntry),
  });

  try {
    await logAuditEvent({
      action: 'DELETE_EVENT',
      actionType: 'DELETE',
      details: `Archived event "${eventData.title || eventId}" was moved to trash by ${adminName || 'Admin'}. Reason: ${reason || 'Soft-delete'}`,
      performedBy: adminName || 'Admin',
      userRole: 'SAO Admin',
      targetId: eventId,
      targetName: eventData.title || 'Event',
    });
  } catch (auditErr) {
    console.warn('[softDeleteArchivedEvent] Non-critical audit log failure:', auditErr);
  }
}
