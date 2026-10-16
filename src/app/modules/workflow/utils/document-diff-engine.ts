/**
 * src/app/modules/workflow/utils/document-diff-engine.ts
 *
 * Universal change detection and field-level diff engine across
 * Activity Proposals (AP), Financial Liquidations (FL), and Post-Activity Reports (PAR).
 * Detects additions, removals, and modifications between revision cycles.
 */

import type { FieldDiffEntry } from '../types/approval.types';

// Format currency in PHP
function formatMoney(amount: any): string {
  const num = typeof amount === 'number' ? amount : parseFloat(amount) || 0;
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(num);
}

// Clean string for comparison
function clean(val: any): string {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

/**
 * Compare two Activity Proposals (Old Snapshot vs. New/Current State)
 */
export function diffActivityProposal(
  oldDoc: Record<string, any> | null | undefined,
  newDoc: Record<string, any> | null | undefined
): FieldDiffEntry[] {
  if (!oldDoc || !newDoc) return [];
  const diffs: FieldDiffEntry[] = [];

  // 1. General Information
  if (clean(oldDoc.title) !== clean(newDoc.title)) {
    diffs.push({
      fieldPath: 'title',
      label: 'Activity Title',
      section: 'General Info',
      changeType: 'modified',
      oldValue: oldDoc.title,
      newValue: newDoc.title,
      diffSummary: `Title changed from "${oldDoc.title || 'Untitled'}" to "${newDoc.title}"`,
    });
  }

  if (clean(oldDoc.description) !== clean(newDoc.description)) {
    diffs.push({
      fieldPath: 'description',
      label: 'Activity Description',
      section: 'General Info',
      changeType: 'modified',
      oldValue: oldDoc.description,
      newValue: newDoc.description,
      diffSummary: 'Description was revised.',
    });
  }

  // Headcount
  const oldHeadcount = oldDoc.targetAudience?.expectedAttendees ?? oldDoc.expectedAttendees;
  const newHeadcount = newDoc.targetAudience?.expectedAttendees ?? newDoc.expectedAttendees;
  if (oldHeadcount !== undefined && newHeadcount !== undefined && Number(oldHeadcount) !== Number(newHeadcount)) {
    diffs.push({
      fieldPath: 'targetAudience.expectedAttendees',
      label: 'Target Headcount',
      section: 'Target Audience',
      changeType: 'modified',
      oldValue: oldHeadcount,
      newValue: newHeadcount,
      diffSummary: `Expected attendees changed from ${oldHeadcount} to ${newHeadcount}`,
    });
  }

  // 2. Budget & Line Items
  const oldBudget = oldDoc.allocatedBudget ?? oldDoc.totalAllocatedBudget ?? 0;
  const newBudget = newDoc.allocatedBudget ?? newDoc.totalAllocatedBudget ?? 0;
  if (Number(oldBudget) !== Number(newBudget)) {
    diffs.push({
      fieldPath: 'allocatedBudget',
      label: 'Total Proposed Budget',
      section: 'Financials & Budget',
      changeType: 'modified',
      oldValue: formatMoney(oldBudget),
      newValue: formatMoney(newBudget),
      diffSummary: `Total budget adjusted from ${formatMoney(oldBudget)} to ${formatMoney(newBudget)}`,
    });
  }

  // Line Items Deep Diff
  const oldItems: any[] = oldDoc.lineItems || oldDoc.budgetItems || oldDoc.budget?.lineItems || [];
  const newItems: any[] = newDoc.lineItems || newDoc.budgetItems || newDoc.budget?.lineItems || [];

  // Match items by description or id
  const oldItemMap = new Map<string, any>();
  oldItems.forEach((it, idx) => {
    const key = it.id || it.description || `item_${idx}`;
    oldItemMap.set(key, it);
  });

  const matchedOldKeys = new Set<string>();

  newItems.forEach((newItem, idx) => {
    const key = newItem.id || newItem.description || `item_${idx}`;
    const oldItem = oldItemMap.get(key) || oldItems[idx];

    if (!oldItem) {
      diffs.push({
        fieldPath: `budget.lineItems[${idx}]`,
        label: `Line Item: ${newItem.description || `Item #${idx + 1}`}`,
        section: 'Financials & Budget',
        changeType: 'added',
        oldValue: null,
        newValue: `${newItem.description} (${formatMoney(newItem.totalCost || newItem.amount || 0)})`,
        diffSummary: `Added budget item: "${newItem.description}" for ${formatMoney(newItem.totalCost || newItem.amount || 0)}`,
      });
    } else {
      matchedOldKeys.add(oldItem.id || oldItem.description || `item_${idx}`);
      const oldCost = oldItem.totalCost ?? oldItem.amount ?? 0;
      const newCost = newItem.totalCost ?? newItem.amount ?? 0;
      const oldQty = oldItem.quantity ?? 1;
      const newQty = newItem.quantity ?? 1;

      if (Number(oldCost) !== Number(newCost) || Number(oldQty) !== Number(newQty)) {
        diffs.push({
          fieldPath: `budget.lineItems[${idx}].totalCost`,
          label: `Budget Item: ${newItem.description || `Item #${idx + 1}`}`,
          section: 'Financials & Budget',
          changeType: 'modified',
          oldValue: `${oldQty}x @ ${formatMoney(oldCost)}`,
          newValue: `${newQty}x @ ${formatMoney(newCost)}`,
          diffSummary: `Adjusted "${newItem.description}": ${formatMoney(oldCost)} ➔ ${formatMoney(newCost)}`,
        });
      }
    }
  });

  // Check for deleted items
  oldItems.forEach((oldItem, idx) => {
    const key = oldItem.id || oldItem.description || `item_${idx}`;
    if (!matchedOldKeys.has(key) && !newItems.some((n) => n.description === oldItem.description)) {
      diffs.push({
        fieldPath: `budget.lineItems[${idx}]`,
        label: `Removed Item: ${oldItem.description || `Item #${idx + 1}`}`,
        section: 'Financials & Budget',
        changeType: 'removed',
        oldValue: `${oldItem.description} (${formatMoney(oldItem.totalCost || oldItem.amount || 0)})`,
        newValue: null,
        diffSummary: `Removed line item "${oldItem.description}" (${formatMoney(oldItem.totalCost || oldItem.amount || 0)})`,
      });
    }
  });

  // 3. Sessions & Logistics
  const oldSessions: any[] = oldDoc.sessions || [];
  const newSessions: any[] = newDoc.sessions || [];

  newSessions.forEach((newSess, idx) => {
    const oldSess = oldSessions[idx];
    if (!oldSess) {
      diffs.push({
        fieldPath: `sessions[${idx}]`,
        label: `Session: ${newSess.title || `Session #${idx + 1}`}`,
        section: 'Schedule & Sessions',
        changeType: 'added',
        oldValue: null,
        newValue: `${newSess.title || 'Session'} on ${newSess.date || 'TBD'} (${newSess.venue || 'No venue'})`,
        diffSummary: `Added new session: "${newSess.title}"`,
      });
    } else {
      if (clean(oldSess.date) !== clean(newSess.date)) {
        diffs.push({
          fieldPath: `sessions[${idx}].date`,
          label: `Session #${idx + 1} Date (${newSess.title || 'Session'})`,
          section: 'Schedule & Sessions',
          changeType: 'modified',
          oldValue: oldSess.date,
          newValue: newSess.date,
          diffSummary: `Date moved from ${oldSess.date || 'TBD'} to ${newSess.date}`,
        });
      }
      if (clean(oldSess.venue) !== clean(newSess.venue)) {
        diffs.push({
          fieldPath: `sessions[${idx}].venue`,
          label: `Session #${idx + 1} Venue (${newSess.title || 'Session'})`,
          section: 'Schedule & Sessions',
          changeType: 'modified',
          oldValue: oldSess.venue,
          newValue: newSess.venue,
          diffSummary: `Venue changed from "${oldSess.venue || 'TBD'}" to "${newSess.venue}"`,
        });
      }
      if (clean(oldSess.startTime) !== clean(newSess.startTime) || clean(oldSess.endTime) !== clean(newSess.endTime)) {
        diffs.push({
          fieldPath: `sessions[${idx}].time`,
          label: `Session #${idx + 1} Time (${newSess.title || 'Session'})`,
          section: 'Schedule & Sessions',
          changeType: 'modified',
          oldValue: `${oldSess.startTime || ''} - ${oldSess.endTime || ''}`,
          newValue: `${newSess.startTime || ''} - ${newSess.endTime || ''}`,
          diffSummary: `Time slot updated to ${newSess.startTime} - ${newSess.endTime}`,
        });
      }
    }
  });

  return diffs;
}

/**
 * Compare two Financial Liquidation Reports
 */
export function diffFinancialLiquidation(
  oldDoc: Record<string, any> | null | undefined,
  newDoc: Record<string, any> | null | undefined
): FieldDiffEntry[] {
  if (!oldDoc || !newDoc) return [];
  const diffs: FieldDiffEntry[] = [];

  // Spending & Surplus
  const oldSpent = oldDoc.totalActualSpending ?? 0;
  const newSpent = newDoc.totalActualSpending ?? 0;
  if (Number(oldSpent) !== Number(newSpent)) {
    diffs.push({
      fieldPath: 'totalActualSpending',
      label: 'Total Actual Expenditure',
      section: 'Financials & Budget',
      changeType: 'modified',
      oldValue: formatMoney(oldSpent),
      newValue: formatMoney(newSpent),
      diffSummary: `Total expenditure adjusted from ${formatMoney(oldSpent)} to ${formatMoney(newSpent)}`,
    });
  }

  const oldSurplus = oldDoc.surplusOrDeficit ?? 0;
  const newSurplus = newDoc.surplusOrDeficit ?? 0;
  if (Number(oldSurplus) !== Number(newSurplus)) {
    diffs.push({
      fieldPath: 'surplusOrDeficit',
      label: 'Balance (Surplus / Deficit)',
      section: 'Financials & Budget',
      changeType: 'modified',
      oldValue: formatMoney(oldSurplus),
      newValue: formatMoney(newSurplus),
      diffSummary: `Balance recalculated to ${formatMoney(newSurplus)} (previously ${formatMoney(oldSurplus)})`,
    });
  }

  // Line Items & Receipts
  const oldItems: any[] = oldDoc.lineItems || [];
  const newItems: any[] = newDoc.lineItems || [];

  newItems.forEach((newItem, idx) => {
    const oldItem = oldItems[idx];
    if (!oldItem) {
      diffs.push({
        fieldPath: `lineItems[${idx}]`,
        label: `Expense Item: ${newItem.particulars || newItem.description || `Item #${idx + 1}`}`,
        section: 'Receipts & Vouchers',
        changeType: 'added',
        oldValue: null,
        newValue: `${newItem.particulars || newItem.description} (${formatMoney(newItem.totalCost || newItem.actualCost || 0)})`,
        diffSummary: `Added expense receipt: "${newItem.particulars || newItem.description}"`,
      });
    } else {
      const oldCost = oldItem.totalCost ?? oldItem.actualCost ?? 0;
      const newCost = newItem.totalCost ?? newItem.actualCost ?? 0;
      if (Number(oldCost) !== Number(newCost)) {
        diffs.push({
          fieldPath: `lineItems[${idx}].totalCost`,
          label: `Receipt: ${newItem.particulars || newItem.description || `Item #${idx + 1}`}`,
          section: 'Receipts & Vouchers',
          changeType: 'modified',
          oldValue: formatMoney(oldCost),
          newValue: formatMoney(newCost),
          diffSummary: `Cost corrected from ${formatMoney(oldCost)} to ${formatMoney(newCost)}`,
        });
      }
      if (clean(oldItem.receiptNumber) !== clean(newItem.receiptNumber)) {
        diffs.push({
          fieldPath: `lineItems[${idx}].receiptNumber`,
          label: `Receipt # (${newItem.particulars || newItem.description})`,
          section: 'Receipts & Vouchers',
          changeType: 'modified',
          oldValue: oldItem.receiptNumber || 'None',
          newValue: newItem.receiptNumber || 'None',
          diffSummary: `Receipt reference changed: ${oldItem.receiptNumber || 'None'} ➔ ${newItem.receiptNumber}`,
        });
      }
      if (clean(oldItem.receiptUrl) !== clean(newItem.receiptUrl) && newItem.receiptUrl) {
        diffs.push({
          fieldPath: `lineItems[${idx}].receiptUrl`,
          label: `Proof File (${newItem.particulars || newItem.description})`,
          section: 'Receipts & Vouchers',
          changeType: 'modified',
          oldValue: 'Previous Receipt File',
          newValue: 'Updated Receipt File',
          diffSummary: 'Receipt image proof was replaced with an updated file.',
        });
      }
    }
  });

  return diffs;
}

/**
 * Compare two Post-Activity Reports
 */
export function diffPostActivityReport(
  oldDoc: Record<string, any> | null | undefined,
  newDoc: Record<string, any> | null | undefined
): FieldDiffEntry[] {
  if (!oldDoc || !newDoc) return [];
  const diffs: FieldDiffEntry[] = [];

  const oldAtt = oldDoc.actualAttendeesCount ?? oldDoc.attendanceCount;
  const newAtt = newDoc.actualAttendeesCount ?? newDoc.attendanceCount;
  if (oldAtt !== undefined && newAtt !== undefined && Number(oldAtt) !== Number(newAtt)) {
    diffs.push({
      fieldPath: 'actualAttendeesCount',
      label: 'Verified Attendees Count',
      section: 'Attendance & Analytics',
      changeType: 'modified',
      oldValue: oldAtt,
      newValue: newAtt,
      diffSummary: `Attendee count updated from ${oldAtt} to ${newAtt}`,
    });
  }

  if (clean(oldDoc.executiveSummary) !== clean(newDoc.executiveSummary)) {
    diffs.push({
      fieldPath: 'executiveSummary',
      label: 'Executive Summary',
      section: 'Narrative & Documentation',
      changeType: 'modified',
      oldValue: 'Previous summary text',
      newValue: 'Revised executive narrative',
      diffSummary: 'Executive summary narrative was revised.',
    });
  }

  return diffs;
}

/**
 * Universal Master Diff Function
 */
export function diffAnyDocument(
  oldDoc: Record<string, any> | null | undefined,
  newDoc: Record<string, any> | null | undefined,
  docType: 'AP' | 'FL' | 'PAR' = 'AP'
): FieldDiffEntry[] {
  if (docType === 'FL') {
    return diffFinancialLiquidation(oldDoc, newDoc);
  }
  if (docType === 'PAR') {
    return diffPostActivityReport(oldDoc, newDoc);
  }
  return diffActivityProposal(oldDoc, newDoc);
}
