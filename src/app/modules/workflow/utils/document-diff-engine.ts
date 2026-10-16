/**
 * src/app/modules/workflow/utils/document-diff-engine.ts
 *
 * Universal change detection and field-level diff engine across
 * Activity Proposals (AP), Financial Liquidations (FL), and Post-Activity Reports (PAR).
 * Accurately classifies changes into 'added', 'removed', and 'modified' across all official fields.
 */

import type { FieldDiffEntry } from '../types/approval.types';

// Format currency in PHP
export function formatMoney(amount: any): string {
  const num = typeof amount === 'number' ? amount : parseFloat(amount) || 0;
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(num);
}

// Clean string for comparison
export function clean(val: any): string {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

/**
 * Robust helper to extract a human-readable title/name for an item across schemas
 * (supports item, itemName, particulars, description, name, title, label)
 */
export function getItemName(it: any, defaultIndex = 1): string {
  if (!it) return `Item #${defaultIndex}`;
  if (typeof it === 'string') return it.trim();
  const raw =
    it.item ||
    it.itemName ||
    it.particulars ||
    it.description ||
    it.name ||
    it.title ||
    it.label ||
    '';
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  if (it.description && typeof it.description === 'string' && it.description.trim()) {
    return it.description.trim();
  }
  if (it.remarks && typeof it.remarks === 'string' && it.remarks.trim()) {
    return it.remarks.trim();
  }
  return `Item #${defaultIndex}`;
}

/**
 * Compare two string arrays (e.g. objectives, mechanics, materials, marketing plan)
 * Detects items that were added, removed, or modified.
 */
function diffStringArray(
  oldArr: any[] = [],
  newArr: any[] = [],
  section: string,
  fieldLabelPrefix: string,
  fieldPathPrefix: string
): FieldDiffEntry[] {
  const diffs: FieldDiffEntry[] = [];
  const cleanOld = oldArr.map((v) => clean(v)).filter(Boolean);
  const cleanNew = newArr.map((v) => clean(v)).filter(Boolean);

  const oldSet = new Set(cleanOld);
  const newSet = new Set(cleanNew);

  // Added items
  cleanNew.forEach((item, idx) => {
    if (!oldSet.has(item)) {
      // Check if it's a modification of the item at the same index
      const oldItemAtSameIdx = cleanOld[idx];
      if (oldItemAtSameIdx && !newSet.has(oldItemAtSameIdx)) {
        diffs.push({
          fieldPath: `${fieldPathPrefix}[${idx}]`,
          label: `${fieldLabelPrefix} #${idx + 1}`,
          section,
          changeType: 'modified',
          oldValue: oldItemAtSameIdx,
          newValue: item,
          diffSummary: `Modified ${fieldLabelPrefix.toLowerCase()} #${idx + 1}: "${oldItemAtSameIdx}" ➔ "${item}"`,
        });
      } else {
        diffs.push({
          fieldPath: `${fieldPathPrefix}[${idx}]`,
          label: `${fieldLabelPrefix}: "${item.slice(0, 45)}${item.length > 45 ? '...' : ''}"`,
          section,
          changeType: 'added',
          oldValue: null,
          newValue: item,
          diffSummary: `Added new ${fieldLabelPrefix.toLowerCase()}: "${item}"`,
        });
      }
    }
  });

  // Removed items
  cleanOld.forEach((item, idx) => {
    if (!newSet.has(item)) {
      // If this item was already treated as a modification of cleanNew[idx], skip duplicate removed entry
      const wasModified = cleanNew[idx] && !oldSet.has(cleanNew[idx]);
      if (!wasModified) {
        diffs.push({
          fieldPath: `${fieldPathPrefix}[${idx}]`,
          label: `Removed ${fieldLabelPrefix}: "${item.slice(0, 45)}${item.length > 45 ? '...' : ''}"`,
          section,
          changeType: 'removed',
          oldValue: item,
          newValue: null,
          diffSummary: `Removed ${fieldLabelPrefix.toLowerCase()}: "${item}"`,
        });
      }
    }
  });

  return diffs;
}

/**
 * Compare Committee Tasks & Milestones
 */
function diffTasks(oldTasks: any[] = [], newTasks: any[] = []): FieldDiffEntry[] {
  const diffs: FieldDiffEntry[] = [];

  const oldTaskMap = new Map<string, any>();
  oldTasks.forEach((t, idx) => {
    const key = clean(t.id) || clean(t.taskName) || `task_${idx}`;
    oldTaskMap.set(key, t);
  });

  const matchedOldKeys = new Set<string>();

  newTasks.forEach((newTask, idx) => {
    const key = clean(newTask.id) || clean(newTask.taskName) || `task_${idx}`;
    const oldTask = oldTaskMap.get(key) || oldTasks[idx];
    const taskName = newTask.taskName || `Task #${idx + 1}`;

    if (!oldTask) {
      diffs.push({
        fieldPath: `tasks[${idx}]`,
        label: `Task: ${taskName}`,
        section: 'Task List & Milestones',
        changeType: 'added',
        oldValue: null,
        newValue: `${taskName} (Assigned: ${newTask.assignedPerson || 'TBD'} • Due: ${newTask.completionDate || 'TBD'})`,
        diffSummary: `Added committee task "${taskName}" assigned to ${newTask.assignedPerson || 'Unassigned'}`,
      });
    } else {
      matchedOldKeys.add(clean(oldTask.id) || clean(oldTask.taskName) || `task_${idx}`);
      const oldPerson = clean(oldTask.assignedPerson);
      const newPerson = clean(newTask.assignedPerson);
      const oldDate = clean(oldTask.completionDate);
      const newDate = clean(newTask.completionDate);

      if (oldPerson !== newPerson || oldDate !== newDate) {
        const changes: string[] = [];
        if (oldPerson !== newPerson) changes.push(`Assignee: "${oldPerson || 'None'}" ➔ "${newPerson || 'None'}"`);
        if (oldDate !== newDate) changes.push(`Due date: "${oldDate || 'TBD'}" ➔ "${newDate || 'TBD'}"`);

        diffs.push({
          fieldPath: `tasks[${idx}]`,
          label: `Task: ${taskName}`,
          section: 'Task List & Milestones',
          changeType: 'modified',
          oldValue: `Assignee: ${oldPerson || 'TBD'} • Due: ${oldDate || 'TBD'}`,
          newValue: `Assignee: ${newPerson || 'TBD'} • Due: ${newDate || 'TBD'}`,
          diffSummary: `Task "${taskName}" updated (${changes.join('; ')})`,
        });
      }
    }
  });

  // Removed tasks
  oldTasks.forEach((oldTask, idx) => {
    const key = clean(oldTask.id) || clean(oldTask.taskName) || `task_${idx}`;
    if (!matchedOldKeys.has(key) && !newTasks.some((n) => clean(n.taskName) === clean(oldTask.taskName))) {
      const taskName = oldTask.taskName || `Task #${idx + 1}`;
      diffs.push({
        fieldPath: `tasks[${idx}]`,
        label: `Removed Task: ${taskName}`,
        section: 'Task List & Milestones',
        changeType: 'removed',
        oldValue: `${taskName} (Assigned: ${oldTask.assignedPerson || 'TBD'})`,
        newValue: null,
        diffSummary: `Removed task "${taskName}" from committee list`,
      });
    }
  });

  return diffs;
}

/**
 * Compare Multi-Session Agenda & Timetable
 */
function diffSessions(oldSessions: any[] = [], newSessions: any[] = []): FieldDiffEntry[] {
  const diffs: FieldDiffEntry[] = [];

  const oldSessionMap = new Map<string, any>();
  oldSessions.forEach((s, idx) => {
    const key = clean(s.id) || clean(s.title) || clean(s.sessionName) || `sess_${idx}`;
    oldSessionMap.set(key, s);
  });

  const matchedOldKeys = new Set<string>();

  newSessions.forEach((newSess, idx) => {
    const key = clean(newSess.id) || clean(newSess.title) || clean(newSess.sessionName) || `sess_${idx}`;
    const oldSess = oldSessionMap.get(key) || oldSessions[idx];
    const sessTitle = newSess.title || newSess.sessionName || `Session #${idx + 1}`;

    if (!oldSess) {
      diffs.push({
        fieldPath: `sessions[${idx}]`,
        label: `Session: ${sessTitle}`,
        section: 'Schedule & Sessions',
        changeType: 'added',
        oldValue: null,
        newValue: `${sessTitle} (${newSess.date || 'TBD'} ${newSess.startTime || ''}-${newSess.endTime || ''} @ ${newSess.venueName || newSess.venue || 'TBD'})`,
        diffSummary: `Added new session "${sessTitle}"`,
      });
    } else {
      matchedOldKeys.add(clean(oldSess.id) || clean(oldSess.title) || clean(oldSess.sessionName) || `sess_${idx}`);

      const oldDate = clean(oldSess.date);
      const newDate = clean(newSess.date);
      const oldTime = `${clean(oldSess.startTime)} - ${clean(oldSess.endTime)}`;
      const newTime = `${clean(newSess.startTime)} - ${clean(newSess.endTime)}`;
      const oldVenue = clean(oldSess.venueName || oldSess.venue || oldSess.customVenueName);
      const newVenue = clean(newSess.venueName || newSess.venue || newSess.customVenueName);

      if (oldDate !== newDate || oldTime !== newTime || oldVenue !== newVenue) {
        const changes: string[] = [];
        if (oldDate !== newDate) changes.push(`Date: ${oldDate || 'TBD'} ➔ ${newDate || 'TBD'}`);
        if (oldTime !== newTime) changes.push(`Time: ${oldTime} ➔ ${newTime}`);
        if (oldVenue !== newVenue) changes.push(`Venue: "${oldVenue || 'TBD'}" ➔ "${newVenue || 'TBD'}"`);

        diffs.push({
          fieldPath: `sessions[${idx}]`,
          label: `Session: ${sessTitle}`,
          section: 'Schedule & Sessions',
          changeType: 'modified',
          oldValue: `${oldDate || 'TBD'} • ${oldTime} • ${oldVenue || 'TBD'}`,
          newValue: `${newDate || 'TBD'} • ${newTime} • ${newVenue || 'TBD'}`,
          diffSummary: `Updated "${sessTitle}": ${changes.join('; ')}`,
        });
      }
    }
  });

  // Removed sessions
  oldSessions.forEach((oldSess, idx) => {
    const key = clean(oldSess.id) || clean(oldSess.title) || clean(oldSess.sessionName) || `sess_${idx}`;
    if (!matchedOldKeys.has(key)) {
      const sessTitle = oldSess.title || oldSess.sessionName || `Session #${idx + 1}`;
      diffs.push({
        fieldPath: `sessions[${idx}]`,
        label: `Removed Session: ${sessTitle}`,
        section: 'Schedule & Sessions',
        changeType: 'removed',
        oldValue: `${sessTitle} (${oldSess.date || 'TBD'})`,
        newValue: null,
        diffSummary: `Removed session "${sessTitle}"`,
      });
    }
  });

  return diffs;
}

/**
 * Compare Budget & Expense Line Items (Supports 6-column STI format & Event budgetItems)
 */
function diffFinancialItems(
  oldItems: any[] = [],
  newItems: any[] = [],
  section = 'Financials & Budget',
  categoryLabel = 'Expense'
): FieldDiffEntry[] {
  const diffs: FieldDiffEntry[] = [];

  const oldMap = new Map<string, any>();
  oldItems.forEach((it, idx) => {
    const key = clean(it.id) || clean(getItemName(it, idx + 1)).toLowerCase();
    oldMap.set(key, it);
  });

  const matchedOldKeys = new Set<string>();

  newItems.forEach((newItem, idx) => {
    const itemName = getItemName(newItem, idx + 1);
    const key = clean(newItem.id) || clean(itemName).toLowerCase();
    const oldItem = oldMap.get(key) || oldItems[idx];

    const newCost = Number(
      newItem.totalAmount ??
      newItem.totalCost ??
      newItem.approvedAmount ??
      newItem.thisYearProposed ??
      (Number(newItem.unitCost || 0) * Number(newItem.quantity || 1)) ??
      0
    );
    const newQty = Number(newItem.quantity ?? newItem.qty ?? 1);
    const newUnit = Number(newItem.unitCost ?? newItem.unitAmount ?? (newCost / (newQty || 1)));

    if (!oldItem) {
      diffs.push({
        fieldPath: `lineItems[${idx}]`,
        label: `${categoryLabel}: ${itemName}`,
        section,
        changeType: 'added',
        oldValue: null,
        newValue: `${itemName} — ${newQty > 1 ? `${newQty}x @ ${formatMoney(newUnit)} = ` : ''}${formatMoney(newCost)}`,
        diffSummary: `Added new ${categoryLabel.toLowerCase()} "${itemName}" for ${formatMoney(newCost)}`,
      });
    } else {
      matchedOldKeys.add(clean(oldItem.id) || clean(getItemName(oldItem, idx + 1)).toLowerCase());

      const oldCost = Number(
        oldItem.totalAmount ??
        oldItem.totalCost ??
        oldItem.approvedAmount ??
        oldItem.thisYearProposed ??
        (Number(oldItem.unitCost || 0) * Number(oldItem.quantity || 1)) ??
        0
      );
      const oldQty = Number(oldItem.quantity ?? oldItem.qty ?? 1);
      const oldUnit = Number(oldItem.unitCost ?? oldItem.unitAmount ?? (oldCost / (oldQty || 1)));
      const oldRemarks = clean(oldItem.remarks || oldItem.description);
      const newRemarks = clean(newItem.remarks || newItem.description);

      const costChanged = Math.abs(oldCost - newCost) > 0.01;
      const qtyChanged = oldQty !== newQty;
      const remarksChanged = oldRemarks !== newRemarks && Boolean(oldRemarks || newRemarks);

      if (costChanged || qtyChanged || remarksChanged) {
        const changes: string[] = [];
        if (qtyChanged) changes.push(`Qty: ${oldQty} ➔ ${newQty}`);
        if (costChanged) changes.push(`Cost: ${formatMoney(oldCost)} ➔ ${formatMoney(newCost)}`);
        if (remarksChanged) changes.push(`Notes revised`);

        diffs.push({
          fieldPath: `lineItems[${idx}]`,
          label: `${categoryLabel}: ${itemName}`,
          section,
          changeType: 'modified',
          oldValue: `${oldQty > 1 ? `${oldQty}x @ ` : ''}${formatMoney(oldCost)}${oldRemarks ? ` ("${oldRemarks}")` : ''}`,
          newValue: `${newQty > 1 ? `${newQty}x @ ` : ''}${formatMoney(newCost)}${newRemarks ? ` ("${newRemarks}")` : ''}`,
          diffSummary: `Adjusted "${itemName}": ${changes.join('; ')}`,
        });
      }
    }
  });

  // Removed items
  oldItems.forEach((oldItem, idx) => {
    const itemName = getItemName(oldItem, idx + 1);
    const key = clean(oldItem.id) || clean(itemName).toLowerCase();
    if (!matchedOldKeys.has(key) && !newItems.some((n) => clean(getItemName(n)).toLowerCase() === clean(itemName).toLowerCase())) {
      const oldCost = Number(
        oldItem.totalAmount ??
        oldItem.totalCost ??
        oldItem.approvedAmount ??
        oldItem.thisYearProposed ??
        0
      );
      diffs.push({
        fieldPath: `lineItems[${idx}]`,
        label: `Removed ${categoryLabel}: ${itemName}`,
        section,
        changeType: 'removed',
        oldValue: `${itemName} (${formatMoney(oldCost)})`,
        newValue: null,
        diffSummary: `Removed ${categoryLabel.toLowerCase()} "${itemName}" (${formatMoney(oldCost)})`,
      });
    }
  });

  return diffs;
}

/**
 * Compare Target Audience & Market Details
 */
function diffTargetAudience(oldAud: any = {}, newAud: any = {}): FieldDiffEntry[] {
  const diffs: FieldDiffEntry[] = [];

  // Scope
  const oldScope = oldAud.scope || 'all';
  const newScope = newAud.scope || 'all';
  if (oldScope !== newScope) {
    diffs.push({
      fieldPath: 'targetAudience.scope',
      label: 'Target Audience Scope',
      section: 'Target Market',
      changeType: 'modified',
      oldValue: oldScope === 'all' ? 'All Students' : 'Specific Target Groups',
      newValue: newScope === 'all' ? 'All Students' : 'Specific Target Groups',
      diffSummary: `Audience scope changed from "${oldScope}" to "${newScope}"`,
    });
  }

  // Academic Levels (SHS, College)
  const oldLevels = (oldAud.academicLevels || []).join(', ');
  const newLevels = (newAud.academicLevels || []).join(', ');
  if (oldLevels !== newLevels && (oldLevels || newLevels)) {
    diffs.push({
      fieldPath: 'targetAudience.academicLevels',
      label: 'Academic Levels',
      section: 'Target Market',
      changeType: 'modified',
      oldValue: oldLevels || 'None specified',
      newValue: newLevels || 'None specified',
      diffSummary: `Academic level coverage updated to: ${newLevels || 'None'}`,
    });
  }

  // Target Courses / Programs
  const oldCourses = (oldAud.courses || oldAud.courseCodes || oldAud.departments || []).join(', ');
  const newCourses = (newAud.courses || newAud.courseCodes || newAud.departments || []).join(', ');
  if (oldCourses !== newCourses && (oldCourses || newCourses)) {
    diffs.push({
      fieldPath: 'targetAudience.courses',
      label: 'Target Programs / Strands',
      section: 'Target Market',
      changeType: 'modified',
      oldValue: oldCourses || 'All Programs',
      newValue: newCourses || 'All Programs',
      diffSummary: `Target programs updated: ${newCourses || 'All Programs'}`,
    });
  }

  // Target Year Levels
  const oldYearLevels = (oldAud.yearLevels || []).join(', ');
  const newYearLevels = (newAud.yearLevels || []).join(', ');
  if (oldYearLevels !== newYearLevels && (oldYearLevels || newYearLevels)) {
    diffs.push({
      fieldPath: 'targetAudience.yearLevels',
      label: 'Target Year Levels',
      section: 'Target Market',
      changeType: 'modified',
      oldValue: oldYearLevels || 'All Years',
      newValue: newYearLevels || 'All Years',
      diffSummary: `Target year levels updated: ${newYearLevels || 'All Years'}`,
    });
  }

  return diffs;
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SECTION: ACTIVITY PROPOSAL (AP) MASTER DIFF
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function diffActivityProposal(
  oldDoc: Record<string, any> | null | undefined,
  newDoc: Record<string, any> | null | undefined
): FieldDiffEntry[] {
  if (!oldDoc || !newDoc) return [];
  const diffs: FieldDiffEntry[] = [];

  // ─── 1. General Info ───
  if (clean(oldDoc.title) !== clean(newDoc.title)) {
    diffs.push({
      fieldPath: 'title',
      label: 'Activity Title',
      section: 'General Info',
      changeType: 'modified',
      oldValue: oldDoc.title || '(Untitled)',
      newValue: newDoc.title || '(Untitled)',
      diffSummary: `Title changed from "${oldDoc.title || 'Untitled'}" to "${newDoc.title}"`,
    });
  }

  if (clean(oldDoc.description) !== clean(newDoc.description)) {
    diffs.push({
      fieldPath: 'description',
      label: 'Activity Description & Rationale',
      section: 'General Info',
      changeType: 'modified',
      oldValue: oldDoc.description || '(None)',
      newValue: newDoc.description || '(None)',
      diffSummary: 'Activity description/rationale narrative was revised.',
    });
  }

  const oldTheme = clean(oldDoc.theme || oldDoc.tagline);
  const newTheme = clean(newDoc.theme || newDoc.tagline);
  if (oldTheme !== newTheme && (oldTheme || newTheme)) {
    diffs.push({
      fieldPath: 'theme',
      label: 'Activity Theme / Tagline',
      section: 'General Info',
      changeType: !oldTheme ? 'added' : !newTheme ? 'removed' : 'modified',
      oldValue: oldTheme || '(None)',
      newValue: newTheme || '(Removed)',
      diffSummary: `Theme/tagline updated: "${newTheme || 'Removed'}"`,
    });
  }

  const oldFormat = clean(oldDoc.eventFormat || oldDoc.format);
  const newFormat = clean(newDoc.eventFormat || newDoc.format);
  if (oldFormat !== newFormat && (oldFormat || newFormat)) {
    diffs.push({
      fieldPath: 'eventFormat',
      label: 'Event Format',
      section: 'General Info',
      changeType: 'modified',
      oldValue: oldFormat || 'Standard',
      newValue: newFormat || 'Standard',
      diffSummary: `Format adjusted from "${oldFormat || 'Standard'}" to "${newFormat}"`,
    });
  }

  // Organizers & Proponents
  diffs.push(
    ...diffStringArray(
      oldDoc.organizers || oldDoc.proponents || [],
      newDoc.organizers || newDoc.proponents || [],
      'General Info',
      'Organizer / Proponent',
      'organizers'
    )
  );

  // ─── 2. Objectives & Mechanics ───
  diffs.push(
    ...diffStringArray(
      oldDoc.objectives || [],
      newDoc.objectives || [],
      'Objectives & Mechanics',
      'Objective',
      'objectives'
    )
  );

  diffs.push(
    ...diffStringArray(
      oldDoc.successIndicators || [],
      newDoc.successIndicators || [],
      'Objectives & Mechanics',
      'Success Indicator',
      'successIndicators'
    )
  );

  diffs.push(
    ...diffStringArray(
      oldDoc.mechanics || [],
      newDoc.mechanics || [],
      'Objectives & Mechanics',
      'Mechanics Procedure',
      'mechanics'
    )
  );

  diffs.push(
    ...diffStringArray(
      oldDoc.materials || oldDoc.materialsUtilized || [],
      newDoc.materials || newDoc.materialsUtilized || [],
      'Objectives & Mechanics',
      'Material / Equipment',
      'materials'
    )
  );

  // ─── 3. Target Market & Headcount ───
  diffs.push(
    ...diffTargetAudience(oldDoc.targetAudience || {}, newDoc.targetAudience || {})
  );

  // Headcount Comparison
  const oldHeadcount =
    oldDoc.estAttendanceCount ??
    oldDoc.targetAudience?.expectedAttendees ??
    oldDoc.expectedAttendees ??
    oldDoc.expectedParticipantCount ??
    oldDoc.maxAttendees;
  const newHeadcount =
    newDoc.estAttendanceCount ??
    newDoc.targetAudience?.expectedAttendees ??
    newDoc.expectedAttendees ??
    newDoc.expectedParticipantCount ??
    newDoc.maxAttendees;

  if (oldHeadcount !== undefined && newHeadcount !== undefined && Number(oldHeadcount) !== Number(newHeadcount)) {
    diffs.push({
      fieldPath: 'estimatedAttendance',
      label: 'Estimated Attendance / Headcount',
      section: 'Target Market',
      changeType: 'modified',
      oldValue: `${oldHeadcount} participants`,
      newValue: `${newHeadcount} participants`,
      diffSummary: `Projected attendance changed from ${oldHeadcount} to ${newHeadcount}`,
    });
  }

  // Marketing & Documentation Plans
  diffs.push(
    ...diffStringArray(
      oldDoc.marketingPlan || [],
      newDoc.marketingPlan || [],
      'Target Market',
      'Marketing Action',
      'marketingPlan'
    )
  );

  diffs.push(
    ...diffStringArray(
      oldDoc.documentationPlan || [],
      newDoc.documentationPlan || [],
      'Target Market',
      'Documentation Strategy',
      'documentationPlan'
    )
  );

  // ─── 4. Schedule & Logistics ───
  const oldVenue = clean(oldDoc.venueName || oldDoc.venue || oldDoc.customVenueName || oldDoc.sessions?.[0]?.venue);
  const newVenue = clean(newDoc.venueName || newDoc.venue || newDoc.customVenueName || newDoc.sessions?.[0]?.venue);
  if (oldVenue !== newVenue && (oldVenue || newVenue)) {
    diffs.push({
      fieldPath: 'venueName',
      label: 'Primary Venue',
      section: 'Schedule & Sessions',
      changeType: 'modified',
      oldValue: oldVenue || 'TBD',
      newValue: newVenue || 'TBD',
      diffSummary: `Venue changed from "${oldVenue || 'TBD'}" to "${newVenue}"`,
    });
  }

  const oldDate = clean(oldDoc.date || oldDoc.startDate || oldDoc.sessions?.[0]?.date);
  const newDate = clean(newDoc.date || newDoc.startDate || newDoc.sessions?.[0]?.date);
  if (oldDate !== newDate && (oldDate || newDate)) {
    diffs.push({
      fieldPath: 'date',
      label: 'Primary Activity Date',
      section: 'Schedule & Sessions',
      changeType: 'modified',
      oldValue: oldDate || 'TBD',
      newValue: newDate || 'TBD',
      diffSummary: `Activity date moved from ${oldDate || 'TBD'} to ${newDate}`,
    });
  }

  // Sessions breakdown
  diffs.push(...diffSessions(oldDoc.sessions || [], newDoc.sessions || []));

  // ─── 5. Task List / Commitments ───
  diffs.push(...diffTasks(oldDoc.tasks || [], newDoc.tasks || []));

  // ─── 6. Financial Projections & Budget ───
  const oldBudget = Number(
    oldDoc.financialProjections?.totalExpenses ??
    oldDoc.allocatedBudget ??
    oldDoc.totalAllocatedBudget ??
    oldDoc.totalApprovedBudget ??
    0
  );
  const newBudget = Number(
    newDoc.financialProjections?.totalExpenses ??
    newDoc.allocatedBudget ??
    newDoc.totalAllocatedBudget ??
    newDoc.totalApprovedBudget ??
    0
  );

  if (Math.abs(oldBudget - newBudget) > 0.01) {
    diffs.push({
      fieldPath: 'financialProjections.totalExpenses',
      label: 'Total Proposed Budget',
      section: 'Financials & Budget',
      changeType: 'modified',
      oldValue: formatMoney(oldBudget),
      newValue: formatMoney(newBudget),
      diffSummary: `Total budget adjusted from ${formatMoney(oldBudget)} to ${formatMoney(newBudget)}`,
    });
  }

  const oldRevenue = Number(oldDoc.financialProjections?.totalRevenue ?? 0);
  const newRevenue = Number(newDoc.financialProjections?.totalRevenue ?? 0);
  if (Math.abs(oldRevenue - newRevenue) > 0.01) {
    diffs.push({
      fieldPath: 'financialProjections.totalRevenue',
      label: 'Total Projected Revenue',
      section: 'Financials & Budget',
      changeType: 'modified',
      oldValue: formatMoney(oldRevenue),
      newValue: formatMoney(newRevenue),
      diffSummary: `Projected revenues adjusted from ${formatMoney(oldRevenue)} to ${formatMoney(newRevenue)}`,
    });
  }

  const oldBalance = Number(oldDoc.financialProjections?.balance ?? (oldRevenue - oldBudget));
  const newBalance = Number(newDoc.financialProjections?.balance ?? (newRevenue - newBudget));
  if (Math.abs(oldBalance - newBalance) > 0.01) {
    diffs.push({
      fieldPath: 'financialProjections.balance',
      label: 'Net Balance / Surplus',
      section: 'Financials & Budget',
      changeType: 'modified',
      oldValue: formatMoney(oldBalance),
      newValue: formatMoney(newBalance),
      diffSummary: `Net balance revised from ${formatMoney(oldBalance)} to ${formatMoney(newBalance)}`,
    });
  }

  // Expense Line Items (extracts from financialProjections.expenses, budgetItems, or lineItems)
  const oldExpenses =
    oldDoc.financialProjections?.expenses ||
    oldDoc.budgetItems ||
    oldDoc.lineItems ||
    oldDoc.budget?.lineItems ||
    [];
  const newExpenses =
    newDoc.financialProjections?.expenses ||
    newDoc.budgetItems ||
    newDoc.lineItems ||
    newDoc.budget?.lineItems ||
    [];

  diffs.push(...diffFinancialItems(oldExpenses, newExpenses, 'Financials & Budget', 'Expense Item'));

  // Revenue Line Items
  const oldRevenues = oldDoc.financialProjections?.revenues || [];
  const newRevenues = newDoc.financialProjections?.revenues || [];
  if (oldRevenues.length > 0 || newRevenues.length > 0) {
    diffs.push(...diffFinancialItems(oldRevenues, newRevenues, 'Financials & Budget', 'Revenue Source'));
  }

  // ─── 7. Urgency & Vetting ───
  if (Boolean(oldDoc.isUrgent) !== Boolean(newDoc.isUrgent)) {
    diffs.push({
      fieldPath: 'isUrgent',
      label: 'Fast-Track Urgency Status',
      section: 'General Info',
      changeType: 'modified',
      oldValue: oldDoc.isUrgent ? 'Marked Urgent' : 'Standard Routine Review',
      newValue: newDoc.isUrgent ? 'Marked Urgent' : 'Standard Routine Review',
      diffSummary: `Filing priority set to ${newDoc.isUrgent ? 'Urgent / Fast-Track' : 'Standard'}`,
    });
  }

  if (clean(oldDoc.urgentJustification) !== clean(newDoc.urgentJustification) && (oldDoc.urgentJustification || newDoc.urgentJustification)) {
    diffs.push({
      fieldPath: 'urgentJustification',
      label: 'Urgent Filing Justification',
      section: 'General Info',
      changeType: !oldDoc.urgentJustification ? 'added' : 'modified',
      oldValue: oldDoc.urgentJustification || '(None)',
      newValue: newDoc.urgentJustification || '(Removed)',
      diffSummary: 'Urgent justification rationale was revised.',
    });
  }

  return diffs;
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SECTION: FINANCIAL LIQUIDATION (FL) MASTER DIFF
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function diffFinancialLiquidation(
  oldDoc: Record<string, any> | null | undefined,
  newDoc: Record<string, any> | null | undefined
): FieldDiffEntry[] {
  if (!oldDoc || !newDoc) return [];
  const diffs: FieldDiffEntry[] = [];

  // Spending & Surplus
  const oldSpent = Number(oldDoc.totalActualSpending ?? 0);
  const newSpent = Number(newDoc.totalActualSpending ?? 0);
  if (Math.abs(oldSpent - newSpent) > 0.01) {
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

  const oldSurplus = Number(oldDoc.surplusOrDeficit ?? 0);
  const newSurplus = Number(newDoc.surplusOrDeficit ?? 0);
  if (Math.abs(oldSurplus - newSurplus) > 0.01) {
    diffs.push({
      fieldPath: 'surplusOrDeficit',
      label: 'Liquidation Balance (Surplus / Deficit)',
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

  const oldMap = new Map<string, any>();
  oldItems.forEach((it, idx) => {
    const key = clean(it.id) || clean(getItemName(it, idx + 1)).toLowerCase();
    oldMap.set(key, it);
  });

  const matchedOldKeys = new Set<string>();

  newItems.forEach((newItem, idx) => {
    const itemName = getItemName(newItem, idx + 1);
    const key = clean(newItem.id) || clean(itemName).toLowerCase();
    const oldItem = oldMap.get(key) || oldItems[idx];
    const newCost = Number(newItem.totalCost ?? newItem.actualCost ?? (Number(newItem.quantity || 1) * Number(newItem.unitCost || 0)));

    if (!oldItem) {
      diffs.push({
        fieldPath: `lineItems[${idx}]`,
        label: `Expense Receipt: ${itemName}`,
        section: 'Receipts & Vouchers',
        changeType: 'added',
        oldValue: null,
        newValue: `${itemName} (${formatMoney(newCost)}) — OR# ${newItem.receiptNumber || 'N/A'} • Vendor: ${newItem.vendorName || 'N/A'}`,
        diffSummary: `Added new expense receipt: "${itemName}" for ${formatMoney(newCost)}`,
      });
    } else {
      matchedOldKeys.add(clean(oldItem.id) || clean(getItemName(oldItem, idx + 1)).toLowerCase());

      const oldCost = Number(oldItem.totalCost ?? oldItem.actualCost ?? (Number(oldItem.quantity || 1) * Number(oldItem.unitCost || 0)));
      const oldReceipt = clean(oldItem.receiptNumber);
      const newReceipt = clean(newItem.receiptNumber);
      const oldVendor = clean(oldItem.vendorName);
      const newVendor = clean(newItem.vendorName);
      const oldReceiptUrl = clean(oldItem.receiptUrl || oldItem.receiptUrls?.[0]);
      const newReceiptUrl = clean(newItem.receiptUrl || newItem.receiptUrls?.[0]);

      const costChanged = Math.abs(oldCost - newCost) > 0.01;
      const receiptChanged = oldReceipt !== newReceipt;
      const vendorChanged = oldVendor !== newVendor;
      const proofChanged = oldReceiptUrl !== newReceiptUrl && Boolean(newReceiptUrl);

      if (costChanged || receiptChanged || vendorChanged || proofChanged) {
        const changes: string[] = [];
        if (costChanged) changes.push(`Amount: ${formatMoney(oldCost)} ➔ ${formatMoney(newCost)}`);
        if (receiptChanged) changes.push(`Receipt #: ${oldReceipt || 'None'} ➔ ${newReceipt}`);
        if (vendorChanged) changes.push(`Vendor: ${oldVendor || 'None'} ➔ ${newVendor}`);
        if (proofChanged) changes.push(`Proof voucher image updated`);

        diffs.push({
          fieldPath: `lineItems[${idx}]`,
          label: `Receipt: ${itemName}`,
          section: 'Receipts & Vouchers',
          changeType: 'modified',
          oldValue: `${formatMoney(oldCost)} • OR# ${oldReceipt || 'N/A'} • ${oldVendor || 'N/A'}`,
          newValue: `${formatMoney(newCost)} • OR# ${newReceipt || 'N/A'} • ${newVendor || 'N/A'}`,
          diffSummary: `Adjusted receipt for "${itemName}": ${changes.join('; ')}`,
        });
      }
    }
  });

  // Removed items
  oldItems.forEach((oldItem, idx) => {
    const itemName = getItemName(oldItem, idx + 1);
    const key = clean(oldItem.id) || clean(itemName).toLowerCase();
    if (!matchedOldKeys.has(key) && !newItems.some((n) => clean(getItemName(n)).toLowerCase() === clean(itemName).toLowerCase())) {
      const oldCost = Number(oldItem.totalCost ?? oldItem.actualCost ?? 0);
      diffs.push({
        fieldPath: `lineItems[${idx}]`,
        label: `Removed Receipt: ${itemName}`,
        section: 'Receipts & Vouchers',
        changeType: 'removed',
        oldValue: `${itemName} (${formatMoney(oldCost)})`,
        newValue: null,
        diffSummary: `Removed expense line item "${itemName}" (${formatMoney(oldCost)})`,
      });
    }
  });

  return diffs;
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SECTION: POST-ACTIVITY REPORT (PAR) MASTER DIFF
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function diffPostActivityReport(
  oldDoc: Record<string, any> | null | undefined,
  newDoc: Record<string, any> | null | undefined
): FieldDiffEntry[] {
  if (!oldDoc || !newDoc) return [];
  const diffs: FieldDiffEntry[] = [];

  // 1. Attendance Verification
  const oldAtt =
    oldDoc.attendanceSummary?.attendedCount ??
    oldDoc.actualAttendeesCount ??
    oldDoc.attendanceCount;
  const newAtt =
    newDoc.attendanceSummary?.attendedCount ??
    newDoc.actualAttendeesCount ??
    newDoc.attendanceCount;

  if (oldAtt !== undefined && newAtt !== undefined && Number(oldAtt) !== Number(newAtt)) {
    diffs.push({
      fieldPath: 'attendanceSummary.attendedCount',
      label: 'Verified Attendees Count',
      section: 'Attendance & Analytics',
      changeType: 'modified',
      oldValue: `${oldAtt} students`,
      newValue: `${newAtt} students`,
      diffSummary: `Verified attendance updated from ${oldAtt} to ${newAtt}`,
    });
  }

  const oldReg = oldDoc.attendanceSummary?.registeredCount;
  const newReg = newDoc.attendanceSummary?.registeredCount;
  if (oldReg !== undefined && newReg !== undefined && Number(oldReg) !== Number(newReg)) {
    diffs.push({
      fieldPath: 'attendanceSummary.registeredCount',
      label: 'Total Registered Participants',
      section: 'Attendance & Analytics',
      changeType: 'modified',
      oldValue: `${oldReg} registered`,
      newValue: `${newReg} registered`,
      diffSummary: `Pre-registration count updated from ${oldReg} to ${newReg}`,
    });
  }

  const oldWho = clean(oldDoc.attendanceSummary?.whoAttended);
  const newWho = clean(newDoc.attendanceSummary?.whoAttended);
  if (oldWho !== newWho && (oldWho || newWho)) {
    diffs.push({
      fieldPath: 'attendanceSummary.whoAttended',
      label: 'Actual Participant Breakdown',
      section: 'Attendance & Analytics',
      changeType: 'modified',
      oldValue: oldWho || '(Empty)',
      newValue: newWho || '(Empty)',
      diffSummary: `Participant demographic updated to: ${newWho}`,
    });
  }

  // Actual vs Planned Mechanics
  if (clean(oldDoc.actualMechanics) !== clean(newDoc.actualMechanics)) {
    diffs.push({
      fieldPath: 'actualMechanics',
      label: 'Actual Operational Mechanics Variance',
      section: 'Narrative & Documentation',
      changeType: 'modified',
      oldValue: oldDoc.actualMechanics || '(None noted)',
      newValue: newDoc.actualMechanics || '(None noted)',
      diffSummary: 'Notes on actual mechanics executed were updated.',
    });
  }

  // Venue differences
  if (clean(oldDoc.eventVenue) !== clean(newDoc.eventVenue) && (oldDoc.eventVenue || newDoc.eventVenue)) {
    diffs.push({
      fieldPath: 'eventVenue',
      label: 'Conducted Event Venue',
      section: 'Narrative & Documentation',
      changeType: 'modified',
      oldValue: oldDoc.eventVenue || '(Empty)',
      newValue: newDoc.eventVenue || '(Empty)',
      diffSummary: `Event venue updated from "${oldDoc.eventVenue || 'None'}" to "${newDoc.eventVenue || 'None'}"`,
    });
  }

  // Legacy narrative fields compatibility
  if (clean(oldDoc.executiveSummary) !== clean(newDoc.executiveSummary) && (oldDoc.executiveSummary || newDoc.executiveSummary)) {
    diffs.push({
      fieldPath: 'executiveSummary',
      label: 'Executive Summary',
      section: 'Narrative & Documentation',
      changeType: 'modified',
      oldValue: oldDoc.executiveSummary || '(Empty)',
      newValue: newDoc.executiveSummary || '(Empty)',
      diffSummary: 'Executive summary narrative revised.',
    });
  }

  if (clean(oldDoc.achievedObjectives) !== clean(newDoc.achievedObjectives) && (oldDoc.achievedObjectives || newDoc.achievedObjectives)) {
    diffs.push({
      fieldPath: 'achievedObjectives',
      label: 'Achieved Objectives',
      section: 'Results & Evaluation',
      changeType: 'modified',
      oldValue: oldDoc.achievedObjectives || '(Empty)',
      newValue: newDoc.achievedObjectives || '(Empty)',
      diffSummary: 'Achieved objectives statement revised.',
    });
  }

  // 2. Results & Objective Status
  const oldObjStatus = clean(oldDoc.results?.objectiveStatus);
  const newObjStatus = clean(newDoc.results?.objectiveStatus);
  if (oldObjStatus !== newObjStatus && (oldObjStatus || newObjStatus)) {
    diffs.push({
      fieldPath: 'results.objectiveStatus',
      label: 'Objectives Achievement Level',
      section: 'Results & Evaluation',
      changeType: 'modified',
      oldValue: oldObjStatus.replace('_', ' ').toUpperCase(),
      newValue: newObjStatus.replace('_', ' ').toUpperCase(),
      diffSummary: `Objective fulfillment status changed to: ${newObjStatus.replace('_', ' ')}`,
    });
  }

  if (clean(oldDoc.results?.achievementNarrative) !== clean(newDoc.results?.achievementNarrative)) {
    diffs.push({
      fieldPath: 'results.achievementNarrative',
      label: 'Achievement Narrative',
      section: 'Results & Evaluation',
      changeType: 'modified',
      oldValue: oldDoc.results?.achievementNarrative || '(Empty)',
      newValue: newDoc.results?.achievementNarrative || '(Empty)',
      diffSummary: 'Narrative evaluation of goals achieved was revised.',
    });
  }

  // Key Learnings list diff
  diffs.push(
    ...diffStringArray(
      oldDoc.results?.keyLearnings || [],
      newDoc.results?.keyLearnings || [],
      'Results & Evaluation',
      'Key Learning / Takeaway',
      'results.keyLearnings'
    )
  );

  // Classroom Enrichment
  if (clean(oldDoc.results?.classroomEnrichment) !== clean(newDoc.results?.classroomEnrichment)) {
    diffs.push({
      fieldPath: 'results.classroomEnrichment',
      label: 'Classroom & Curriculum Enrichment',
      section: 'Results & Evaluation',
      changeType: 'modified',
      oldValue: oldDoc.results?.classroomEnrichment || '(Empty)',
      newValue: newDoc.results?.classroomEnrichment || '(Empty)',
      diffSummary: 'Classroom and student development impact revised.',
    });
  }

  // Venue & Logistics Assessments
  if (clean(oldDoc.results?.venueAssessment) !== clean(newDoc.results?.venueAssessment)) {
    diffs.push({
      fieldPath: 'results.venueAssessment',
      label: 'Venue Assessment',
      section: 'Results & Evaluation',
      changeType: 'modified',
      oldValue: oldDoc.results?.venueAssessment || '(Empty)',
      newValue: newDoc.results?.venueAssessment || '(Empty)',
      diffSummary: 'Venue evaluation was updated.',
    });
  }

  if (clean(oldDoc.results?.foodAssessment) !== clean(newDoc.results?.foodAssessment) && (oldDoc.results?.foodAssessment || newDoc.results?.foodAssessment)) {
    diffs.push({
      fieldPath: 'results.foodAssessment',
      label: 'Food & Refreshments Assessment',
      section: 'Results & Evaluation',
      changeType: 'modified',
      oldValue: oldDoc.results?.foodAssessment || '(Empty)',
      newValue: newDoc.results?.foodAssessment || '(Empty)',
      diffSummary: 'Food and refreshments evaluation was updated.',
    });
  }

  if (clean(oldDoc.results?.logisticsAssessment) !== clean(newDoc.results?.logisticsAssessment)) {
    diffs.push({
      fieldPath: 'results.logisticsAssessment',
      label: 'Logistics Assessment',
      section: 'Results & Evaluation',
      changeType: 'modified',
      oldValue: oldDoc.results?.logisticsAssessment || '(Empty)',
      newValue: newDoc.results?.logisticsAssessment || '(Empty)',
      diffSummary: 'Logistics evaluation was updated.',
    });
  }

  if (clean(oldDoc.results?.scheduleCompliance) !== clean(newDoc.results?.scheduleCompliance) && (oldDoc.results?.scheduleCompliance || newDoc.results?.scheduleCompliance)) {
    diffs.push({
      fieldPath: 'results.scheduleCompliance',
      label: 'Schedule Compliance',
      section: 'Results & Evaluation',
      changeType: 'modified',
      oldValue: oldDoc.results?.scheduleCompliance || '(Empty)',
      newValue: newDoc.results?.scheduleCompliance || '(Empty)',
      diffSummary: 'Schedule compliance notes were updated.',
    });
  }

  if (clean(oldDoc.results?.issuesEncountered) !== clean(newDoc.results?.issuesEncountered)) {
    diffs.push({
      fieldPath: 'results.issuesEncountered',
      label: 'Issues Encountered & Resolutions',
      section: 'Results & Evaluation',
      changeType: 'modified',
      oldValue: oldDoc.results?.issuesEncountered || '(None reported)',
      newValue: newDoc.results?.issuesEncountered || '(None reported)',
      diffSummary: 'Bottlenecks and issues encountered narrative revised.',
    });
  }

  // 3. Categorized Recommendations (Exact 4 STI Areas)
  const areas = [
    { key: 'programFlow', label: 'Program Flow & Execution' },
    { key: 'participantEngagement', label: 'Participant Engagement' },
    { key: 'technicalSetup', label: 'Technical & Equipment Setup' },
    { key: 'participantPreparedness', label: 'Participant Preparedness' },
  ];

  areas.forEach(({ key, label }) => {
    const oldObs = clean(oldDoc.recommendations?.[key]?.observations);
    const newObs = clean(newDoc.recommendations?.[key]?.observations);
    const oldRec = clean(oldDoc.recommendations?.[key]?.recommendations);
    const newRec = clean(newDoc.recommendations?.[key]?.recommendations);

    if (oldObs !== newObs || oldRec !== newRec) {
      diffs.push({
        fieldPath: `recommendations.${key}`,
        label: `Recommendations: ${label}`,
        section: 'Results & Recommendations',
        changeType: 'modified',
        oldValue: `Obs: ${oldObs || 'None'} • Rec: ${oldRec || 'None'}`,
        newValue: `Obs: ${newObs || 'None'} • Rec: ${newRec || 'None'}`,
        diffSummary: `Area "${label}" observations and recommendations were revised.`,
      });
    }
  });

  // Photo Documentation Gallery
  const oldPhotos: any[] = oldDoc.photos || [];
  const newPhotos: any[] = newDoc.photos || [];
  if (oldPhotos.length !== newPhotos.length) {
    diffs.push({
      fieldPath: 'photos',
      label: 'Photo Documentation Attachments',
      section: 'Narrative & Documentation',
      changeType: newPhotos.length > oldPhotos.length ? 'added' : 'removed',
      oldValue: `${oldPhotos.length} documentation photos`,
      newValue: `${newPhotos.length} documentation photos`,
      diffSummary: `Photo gallery updated (${oldPhotos.length} ➔ ${newPhotos.length} photos)`,
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
