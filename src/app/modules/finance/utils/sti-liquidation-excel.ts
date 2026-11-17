import * as _XLSX from 'xlsx-js-style';
const XLSX = (_XLSX as any).default || _XLSX;
import PizZip from 'pizzip';
import type { LiquidationDocument } from '../types/liquidation.types';
import { formatAppDate, parseDateSafe } from '../../../utils/date';
import { resolveSignatoryLabel } from '../../signatories/utils/signatory-label.utils';

export interface StiSignatory {
  id: string;
  type: string; // e.g., 'Submitted By:', 'Checked By:', 'Indorsed By:', 'Recommending Approval:', 'Approved By:', 'Noted By:'
  name: string; // Full name of employee or signatory
  role: string; // e.g., '(Name of Employee)', '(Accountant)', '(Supervisor)', '(Administrator)', '(President)'
  date?: string;
  signatureUrl?: string;
  isSigned?: boolean;
}

export interface StiLiquidationExcelOptions {
  officerName?: string;
  chequeNumber?: string;
  activityEndDate?: string;
  submissionDeadline?: string;
  dateSubmitted?: string;
  dateReleased?: string;
  amountAdvanced?: number;
  daysLapsed?: string;
  orNumber?: string;
  accountCharge?: string;
  signatories?: StiSignatory[];
  includeSignatures?: boolean;
  makerSignatureUrl?: string;
  proposedBaselineCategories?: Array<{ id?: string; title: string; baselineAmount: number }>;
  exportFormat?: 'xlsx' | 'xls';
}

export interface GroupedLineItem {
  id?: string;
  description: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  receiptNumber?: string;
  vendorName?: string;
}

export interface GroupedCategoryData {
  categoryTitle: string;
  baselineAmount: number;
  items: GroupedLineItem[];
}

function escapeXml(unsafe: string | number | undefined | null): string {
  if (unsafe === undefined || unsafe === null) return '';
  const str = String(unsafe);
  return str.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case "'": return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

function normalizeCategoryTitle(title: string): string {
  return title.replace(/^[A-Za-z0-9]+\.\s*/, '').trim().toLowerCase();
}

function toGroupedLineItem(it: any): GroupedLineItem {
  const qty = Number(it.quantity || 1);
  const totalCost = Number(it.totalCost ?? (qty * Number(it.unitCost || 0)));
  const unitCost = Number(it.unitCost || (qty > 0 ? totalCost / qty : totalCost));
  return {
    id: it.id,
    description: (it.description || it.vendorName || '—').trim(),
    quantity: qty > 0 ? qty : 1,
    unitCost,
    totalCost,
    receiptNumber: it.receiptNumber?.trim() || '',
    vendorName: it.vendorName?.trim() || '',
  };
}

/**
 * Formats an optional date/timestamp cleanly for signatory `(Date)` cells (MM-DD-YY),
 * preserving empty string when not yet signed.
 */
function formatSignatoryShortDate(rawDate: any): string {
  if (!rawDate) return '';
  const parsed = parseDateSafe(rawDate);
  if (!parsed || Number.isNaN(parsed.getTime())) {
    if (typeof rawDate === 'string' && rawDate.trim()) {
      return rawDate.trim();
    }
    return '';
  }
  const mm = String(parsed.getMonth() + 1).padStart(2, '0');
  const dd = String(parsed.getDate()).padStart(2, '0');
  const yy = String(parsed.getFullYear()).slice(-2);
  return `${mm}-${dd}-${yy}`;
}

/**
 * Resolves all computed metadata fields consistently across preview, .xlsx, and .xls exports.
 */
export function resolveHeaderComputedValues(
  report: LiquidationDocument,
  options: StiLiquidationExcelOptions = {}
) {
  const eventTitle = (report.eventTitle || (report as any).activityTitle || 'Event Activity').trim();
  const officerName =
    options.officerName ||
    report.submittedByName ||
    report.employeeName ||
    report.preparedBy?.name ||
    report.createdByName ||
    '';

  const chequeNumber =
    options.chequeNumber !== undefined
      ? options.chequeNumber
      : (report as any).chequeNumber ||
        (report as any).checkNumber ||
        report.disbursementVoucher?.chequeNumber ||
        '';

  const rawEndDate = options.activityEndDate || report.activityEndDate || formatAppDate(report.createdAt, '');
  const activityEndDate = rawEndDate.replace(/Z$/, '').trim();

  let fallbackDeadline = '';
  const parsedEnd = parseDateSafe(activityEndDate || report.createdAt);
  if (parsedEnd) {
    const deadDate = new Date(parsedEnd.getTime() + 15 * 24 * 60 * 60 * 1000);
    fallbackDeadline = formatAppDate(deadDate, '');
  }
  const submissionDeadline = (options.submissionDeadline || report.submissionDeadline || fallbackDeadline)
    .replace(/Z$/, '')
    .trim();

  const rawSubmitted =
    options.dateSubmitted ||
    report.dateSubmitted ||
    formatAppDate(report.submittedAt || report.createdAt, '');
  const dateSubmitted = rawSubmitted.replace(/Z$/, '').trim();

  const dateReleased = (options.dateReleased || report.dateReleased || report.disbursementVoucher?.disbursementDate || '')
    .replace(/Z$/, '')
    .trim();

  const lineItems = report.lineItems || [];
  const lineItemsActualSum = lineItems.reduce((sum, it) => sum + Number(it.totalCost || 0), 0);
  const totalActualExpense =
    lineItems.length > 0
      ? lineItemsActualSum
      : Number(report.totalActualSpending || (report as any).totalActualSpent || 0);

  const amountAdvanced = Number(
    options.amountAdvanced !== undefined
      ? options.amountAdvanced
      : report.amountAdvanced ?? report.allocatedBudget ?? (report as any).totalAllocatedBudget ?? 0
  );

  const daysLapsed = (options.daysLapsed || report.daysLapsed || '-o-').trim() || '-o-';

  const lineItemORs = Array.from(
    new Set(
      lineItems
        .map((i) => i.receiptNumber?.trim())
        .filter((n): n is string => Boolean(n && n.length > 0))
    )
  );
  const orNumber =
    (options.orNumber !== undefined ? options.orNumber : report.orNumber || '') ||
    (lineItemORs.length > 0 ? lineItemORs.join(', ') : '');

  return {
    eventTitle,
    eventTitleUpper: eventTitle.toUpperCase(),
    officerName,
    chequeNumber,
    activityEndDate,
    submissionDeadline,
    dateSubmitted,
    dateReleased,
    amountAdvanced,
    totalActualExpense,
    daysLapsed,
    orNumber,
    accountCharge: options.accountCharge || '',
  };
}

/**
 * Organizes liquidation line items into the official two-sided layout:
 * - Left side (Col A-B): Proposed budget baseline particulars and cash advance amounts
 * - Center (Col C-F): Actual expenses breakdown entered in liquidation
 */
export function groupLiquidationData(
  report: LiquidationDocument,
  options: StiLiquidationExcelOptions = {}
): GroupedCategoryData[] {
  const lineItems = report.lineItems || [];
  const baselineCategories = options.proposedBaselineCategories || [];
  const fallbackBudget = Number(
    options.amountAdvanced ?? report.amountAdvanced ?? report.allocatedBudget ?? 0
  );

  const groups: GroupedCategoryData[] = [];
  const assignedItemIds = new Set<string>();

  // 1. Match against approved proposal baseline categories first
  if (baselineCategories.length > 0) {
    baselineCategories.forEach((cat) => {
      const catTitle = cat.title.trim();
      const catNorm = normalizeCategoryTitle(catTitle);

      const matchingItems = lineItems.filter((it, idx) => {
        const itemKey = it.id || `item_${idx}`;
        if (assignedItemIds.has(itemKey)) return false;

        const propTitleNorm = it.proposedItemTitle ? normalizeCategoryTitle(it.proposedItemTitle) : '';
        const itemCatNorm = it.category ? normalizeCategoryTitle(it.category) : '';

        const isMatch =
          (Boolean(cat.id) && it.proposedItemId === cat.id) ||
          (propTitleNorm !== '' && propTitleNorm === catNorm) ||
          (itemCatNorm !== '' && itemCatNorm === catNorm);

        if (isMatch) {
          assignedItemIds.add(itemKey);
          return true;
        }
        return false;
      });

      groups.push({
        categoryTitle: catTitle,
        baselineAmount: Number(cat.baselineAmount || 0),
        items: matchingItems.map(toGroupedLineItem),
      });
    });
  }

  // 2. Remaining / custom / unplanned line items
  const unassignedItems = lineItems.filter((it, idx) => !assignedItemIds.has(it.id || `item_${idx}`));
  if (unassignedItems.length > 0) {
    if (baselineCategories.length === 0) {
      const dynamicCatMap = new Map<string, GroupedCategoryData>();
      unassignedItems.forEach((it) => {
        const catName = (it.proposedItemTitle || it.category || 'General Expenses').trim();
        const key = normalizeCategoryTitle(catName) || 'general expenses';
        if (!dynamicCatMap.has(key)) {
          dynamicCatMap.set(key, {
            categoryTitle: catName,
            baselineAmount: Number(it.proposedBaselineAmount || it.allocatedCost || 0),
            items: [],
          });
        }
        dynamicCatMap.get(key)!.items.push(toGroupedLineItem(it));
      });
      dynamicCatMap.forEach((val) => groups.push(val));

      // If no proposal baseline breakdowns were stored on items, attach total advanced budget to first group
      const totalAssignedBaseline = groups.reduce((s, g) => s + g.baselineAmount, 0);
      if (totalAssignedBaseline === 0 && fallbackBudget > 0 && groups.length > 0) {
        groups[0].baselineAmount = fallbackBudget;
      }
    } else {
      groups.push({
        categoryTitle: 'Other / Unplanned Expenses',
        baselineAmount: 0,
        items: unassignedItems.map(toGroupedLineItem),
      });
    }
  }

  if (groups.length === 0) {
    groups.push({
      categoryTitle: 'General Expenses',
      baselineAmount: fallbackBudget,
      items: [],
    });
  }

  return groups;
}

function normalizeStiSignatoryPrefix(rawLabel: string): string {
  const clean = rawLabel.trim();
  const lower = clean.toLowerCase().replace(/:$/, '').trim();
  if (lower === 'submitted by') return 'Submitted By:';
  if (lower === 'checked by') return 'Checked By:';
  if (lower === 'indorsed by') return 'Indorsed By:';
  if (lower === 'endorsed by') return 'Endorsed By:';
  if (lower === 'recommending approval') return 'Recommending Approval:';
  if (lower === 'approved by') return 'Approved By:';
  if (lower === 'noted by') return 'Noted By:';
  if (lower === 'verified by') return 'Verified By:';
  if (lower === 'prepared by') return 'Prepared By:';
  return clean.endsWith(':') ? clean : `${clean}:`;
}

function deriveStiFallbackPrefix(step: any, isLast: boolean): string {
  const roleLower = (step?.role || '').toLowerCase();
  const titleLower = (step?.roleTitle || '').toLowerCase();
  const actionType = (step?.actionType || '').toLowerCase();

  if (actionType === 'check' || roleLower.includes('accountant') || titleLower.includes('accountant') || titleLower.includes('auditor')) {
    return 'Checked By:';
  }
  if (roleLower.includes('president') || titleLower.includes('president')) {
    return actionType === 'note' || !isLast ? 'Noted By:' : 'Noted By:';
  }
  if (roleLower.includes('administrator') || titleLower.includes('administrator') || titleLower.includes('principal')) {
    return 'Approved By:';
  }
  if (roleLower.includes('sas') || titleLower.includes('student affairs') || titleLower.includes('academic')) {
    return 'Recommending Approval:';
  }
  if (isLast && actionType === 'approve') {
    return 'Approved By:';
  }
  if (step?.signatoryLabel) {
    return normalizeStiSignatoryPrefix(step.signatoryLabel);
  }
  const resolved = resolveSignatoryLabel(step, 'liquidation', isLast);
  return normalizeStiSignatoryPrefix(resolved);
}

function resolveRoleParenthetical(step: any): string {
  const roleLower = (step?.role || '').toLowerCase();
  const title = (step?.roleTitle || '').trim();
  const titleLower = title.toLowerCase();

  if (roleLower === 'accountant' || titleLower.includes('accountant') || titleLower.includes('auditor')) {
    return title && !titleLower.includes('accountant / auditor') ? `(${title})` : '(Accountant)';
  }
  if (roleLower === 'school_president' || titleLower === 'president' || titleLower === 'school president') {
    return '(President)';
  }
  if (roleLower === 'school_administrator' || titleLower === 'administrator' || titleLower === 'school administrator') {
    return '(Administrator)';
  }
  if (title) return `(${title})`;
  if (roleLower.includes('supervisor') || roleLower.includes('adviser')) return '(Supervisor)';
  return '(Signatory)';
}

function cleanSig(val?: string | null): string {
  if (typeof val !== 'string') return '';
  const trimmed = val.trim();
  if (!trimmed || trimmed.includes('[base64-') || trimmed === 'undefined' || trimmed === 'null') {
    return '';
  }
  return trimmed;
}

function extractSigFromDoc(data: any): string {
  if (!data || typeof data !== 'object') return '';
  return (
    cleanSig(data.signatureUrl) ||
    cleanSig(data.eSignatureUrl) ||
    cleanSig(data.digitalSignatureUrl) ||
    cleanSig(data.signature) ||
    cleanSig(data.signatureDataUrl) ||
    cleanSig(data.eSignature) ||
    cleanSig(data.preparedBy?.signatureUrl) ||
    ''
  );
}

function isStepSigned(step: any): boolean {
  if (!step || typeof step !== 'object') return false;
  const st = String(step.status || '').toLowerCase().trim();
  return (
    st === 'endorsed' ||
    st === 'approved' ||
    st === 'signed' ||
    st === 'completed' ||
    Boolean(step.signedAt || step.approvedAt || cleanSig(step.signatureUrl))
  );
}

function isSubmittedReport(report: LiquidationDocument, options: StiLiquidationExcelOptions = {}): boolean {
  const st = String(report.status || '').toLowerCase().trim();
  return (
    (st !== '' && st !== 'draft') ||
    Boolean(
      (report as any).submittedAt ||
      report.dateSubmitted ||
      report.preparedBy?.signedAt ||
      options.dateSubmitted ||
      cleanSig(options.makerSignatureUrl) ||
      cleanSig(report.preparedBy?.signatureUrl) ||
      cleanSig(report.submittedBySignatureUrl)
    )
  );
}

/**
 * Dynamically resolves missing e-signatures from Firestore / registered profiles ONLY for:
 * 1) The Maker ("Submitted By:") when attached or already submitted
 * 2) Signatories in `approvalChain` who have ALREADY signed
 */
export async function enrichLiquidationSignatures(
  report: LiquidationDocument,
  options: StiLiquidationExcelOptions = {}
): Promise<LiquidationDocument> {
  if (!report || typeof window === 'undefined') return report;

  try {
    const [{ resolveUserSignature }, { getSasSignatoryConfig }, { db }, firestoreMod] = await Promise.all([
      import('../../signatories/services/signatory-resolver.service'),
      import('../../signatories/services/sas-signatory.service'),
      import('../../../../services/firebase'),
      import('firebase/firestore'),
    ]);
    const { collection, getDocs, limit, query } = firestoreMod;

    // 1. Maker signature: use attached signature first; resolve registered signature for submitted OR SAS reports
    let resolvedMakerSig =
      cleanSig(options.makerSignatureUrl) ||
      cleanSig(report.preparedBy?.signatureUrl) ||
      cleanSig(report.submittedBySignatureUrl) ||
      cleanSig((report as any).makerSignatureUrl) ||
      cleanSig((report as any).signatureUrl);

    let makerName = (
      options.officerName ||
      report.submittedByName ||
      report.employeeName ||
      report.preparedBy?.name ||
      report.createdByName ||
      ''
    ).trim();

    const makerRole = String(
      report.submittedByRole || report.createdByRole || report.preparedBy?.roleTitle || ''
    ).toLowerCase();
    const makerEmail = (report.preparedBy?.email || (report as any).createdByEmail || '').trim();
    const makerUid = (
      (report as any).createdById ||
      (report as any).createdByUid ||
      (report as any).submittedByUid ||
      ''
    ).trim();
    const orgIdLower = String(report.organizationId || '').trim().toLowerCase();
    const isSasMaker =
      makerRole === 'sas_admin' ||
      makerRole === 'admin' ||
      makerRole === 'sao_admin' ||
      makerRole.includes('sas') ||
      makerRole.includes('sao') ||
      Boolean((report as any).isSasInternal) ||
      orgIdLower === 'sas' ||
      orgIdLower === 'sao_admin' ||
      orgIdLower === 'sao' ||
      makerUid === 'sao_admin' ||
      makerUid === 'sas_admin_user' ||
      makerEmail.toLowerCase() === 'sao@ormoc.sti.edu.ph' ||
      makerEmail.toLowerCase().includes('sas') ||
      makerEmail.toLowerCase().includes('sao');

    const sasCfg = await getSasSignatoryConfig().catch(() => null);
    let resolvedMakerRoleTitle = report.preparedBy?.roleTitle || '';

    if (isSasMaker && sasCfg) {
      const lowerMaker = makerName.toLowerCase();
      const isGenericMaker =
        !lowerMaker ||
        lowerMaker === 'sas' ||
        lowerMaker === 'sao' ||
        lowerMaker === 'sas admin' ||
        lowerMaker === 'sao admin' ||
        lowerMaker === 'sas administrator' ||
        lowerMaker === 'sao administrator' ||
        lowerMaker.includes('sas / sao administrator') ||
        lowerMaker.includes('student affairs');
      if (isGenericMaker && sasCfg.name) {
        makerName = sasCfg.name;
      }
      if ((!resolvedMakerRoleTitle || resolvedMakerRoleTitle === 'SAS Administrator') && sasCfg.roleTitle) {
        resolvedMakerRoleTitle = sasCfg.roleTitle;
      }
    }

    if (!resolvedMakerSig && (isSasMaker || isSubmittedReport(report, options))) {
      if (isSasMaker && sasCfg) {
        const cfgSig = cleanSig(sasCfg.signatureUrl) || cleanSig(sasCfg.signatureDataUrl);
        if (cfgSig) resolvedMakerSig = cfgSig;
      }

      if (!resolvedMakerSig) {
        try {
          const directSig = await resolveUserSignature({
            uid: makerUid && makerUid !== 'sao_admin' && makerUid !== 'sas_admin_user' ? makerUid : undefined,
            email: makerEmail || (isSasMaker ? sasCfg?.email || 'sao@ormoc.sti.edu.ph' : undefined),
            name: makerName || undefined,
            role: isSasMaker ? 'sas_admin' : makerRole || 'officer',
          });
          if (cleanSig(directSig)) {
            resolvedMakerSig = cleanSig(directSig);
          }
        } catch {
          // continue to fallbacks
        }
      }

      if (!resolvedMakerSig && isSasMaker) {
        try {
          const cachedRaw = localStorage.getItem('sti_sync_sas_signatory');
          if (cachedRaw) {
            const parsed = JSON.parse(cachedRaw);
            const lsSig = cleanSig(parsed?.signatureUrl) || cleanSig(parsed?.signatureDataUrl);
            if (lsSig) resolvedMakerSig = lsSig;
          }
        } catch {
          // ignore storage access issues
        }

        if (!resolvedMakerSig) {
          try {
            const sasSnap = await getDocs(query(collection(db, 'sas_admins'), limit(50)));
            const sasDocs = sasSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
            const exactSas =
              sasDocs.find(
                (d) =>
                  extractSigFromDoc(d) &&
                  ((makerEmail && String(d.email || '').toLowerCase() === makerEmail.toLowerCase()) ||
                    (makerName && String(d.name || '').toLowerCase() === makerName.toLowerCase()))
              ) || sasDocs.find((d) => extractSigFromDoc(d));
            if (exactSas) resolvedMakerSig = extractSigFromDoc(exactSas);
          } catch {
            // ignore permission edge cases
          }
        }
      }
    }

    // 2. Signed signatories in approvalChain (NEVER attach signatures for pending/unsigned steps)
    let signatoryDocsCache: any[] | null = null;
    const loadInstitutionalSignatories = async () => {
      if (signatoryDocsCache) return signatoryDocsCache;
      try {
        const snap = await getDocs(query(collection(db, 'institutional_signatories'), limit(50)));
        signatoryDocsCache = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      } catch {
        signatoryDocsCache = [];
      }
      return signatoryDocsCache;
    };

    const enrichedChain = await Promise.all(
      (report.approvalChain || []).map(async (step: any) => {
        if (!isStepSigned(step)) {
          return { ...step, signatureUrl: '' };
        }
        let stepSig = cleanSig(step.signatureUrl);
        if (!stepSig) {
          try {
            const sig = await resolveUserSignature({
              uid: (step.signedByUid || step.signatoryUid || '').trim() || undefined,
              email: (step.signedByEmail || step.signatoryEmail || '').trim() || undefined,
              name: (step.signedByName || step.signatoryName || '').trim() || undefined,
              role: step.role || undefined,
            });
            stepSig = cleanSig(sig);
          } catch {
            // continue to collection fallback
          }
        }
        if (!stepSig) {
          const allSigs = await loadInstitutionalSignatories();
          const targetName = String(step.signedByName || step.signatoryName || '').trim().toLowerCase();
          const targetEmail = String(step.signedByEmail || step.signatoryEmail || '').trim().toLowerCase();
          const targetRole = String(step.roleTitle || step.role || '').trim().toLowerCase();
          const match = allSigs.find((s) => {
            if (!extractSigFromDoc(s)) return false;
            const sEmail = String(s.email || '').trim().toLowerCase();
            const sName = String(s.name || '').trim().toLowerCase();
            const sRole = String(s.roleTitle || s.role || '').trim().toLowerCase();
            return (
              (targetEmail && sEmail === targetEmail) ||
              (targetName && sName === targetName) ||
              (targetRole && sRole === targetRole)
            );
          });
          if (match) stepSig = extractSigFromDoc(match);
        }
        return { ...step, signatureUrl: stepSig };
      })
    );

    return {
      ...report,
      ...(resolvedMakerSig
        ? {
            submittedByName: makerName || report.submittedByName,
            submittedBySignatureUrl: resolvedMakerSig,
            preparedBy: {
              ...(report.preparedBy || {}),
              name: makerName || report.preparedBy?.name || '',
              roleTitle: resolvedMakerRoleTitle || report.preparedBy?.roleTitle || '',
              signatureUrl: resolvedMakerSig,
            },
          }
        : makerName && isSasMaker
        ? {
            submittedByName: makerName,
            preparedBy: {
              ...(report.preparedBy || {}),
              name: makerName,
              roleTitle: resolvedMakerRoleTitle || report.preparedBy?.roleTitle || '',
            },
          }
        : {}),
      approvalChain: enrichedChain,
    };
  } catch (err) {
    console.warn('[enrichLiquidationSignatures] Fallback to existing report signatures:', err);
    return report;
  }
}

/**
 * Builds the official signatories list matching LIQUIDATION-FORMAT_v1 (2) - Copy.xlsx (Rows 51-76)
 * from the report's live submitter and `approvalChain` steps (no hardcoded personal fallbacks).
 */
export function resolveOfficialSignatories(
  report: LiquidationDocument,
  options: StiLiquidationExcelOptions = {}
): StiSignatory[] {
  if (options.signatories && options.signatories.length > 0) {
    return options.signatories;
  }

  const officerName =
    options.officerName ||
    report.submittedByName ||
    report.employeeName ||
    report.preparedBy?.name ||
    report.createdByName ||
    '';

  const submittedRaw =
    options.dateSubmitted ||
    report.dateSubmitted ||
    report.submittedAt ||
    report.preparedBy?.signedAt ||
    report.createdAt;
  const dateSubmittedShort = formatSignatoryShortDate(submittedRaw);

  const makerSigUrl = cleanSig(
    options.makerSignatureUrl ||
    report.preparedBy?.signatureUrl ||
    report.submittedBySignatureUrl ||
    (report as any).makerSignatureUrl ||
    (report as any).signatureUrl
  );

  const signatoriesList: StiSignatory[] = [
    {
      id: 'sig_submitted',
      type: 'Submitted By:',
      name: officerName,
      role: '(Name of Employee)',
      date: dateSubmittedShort,
      signatureUrl: makerSigUrl,
      isSigned: Boolean(makerSigUrl) || isSubmittedReport(report, options),
    },
  ];

  const chain = [...(report.approvalChain || [])].sort((a, b) => {
    const stageDiff = Number(a.stageIndex ?? 0) - Number(b.stageIndex ?? 0);
    if (stageDiff !== 0) return stageDiff;
    return Number(a.step ?? 0) - Number(b.step ?? 0);
  });

  if (chain.length > 0) {
    chain.forEach((step, idx) => {
      const isLast = idx === chain.length - 1;
      const prefixLabel = step.signatoryLabel?.trim()
        ? normalizeStiSignatoryPrefix(step.signatoryLabel)
        : deriveStiFallbackPrefix(step, isLast);

      const stepSigned = isStepSigned(step);
      const signedRaw = stepSigned ? ((step as any).signedAt || (step as any).approvedAt) : '';
      const signedDateShort = formatSignatoryShortDate(signedRaw);
      const stepSigUrl = stepSigned ? cleanSig((step as any).signatureUrl) : '';

      signatoriesList.push({
        id: step.id || `sig_step_${idx + 1}`,
        type: prefixLabel,
        name: step.signatoryName || '',
        role: resolveRoleParenthetical(step),
        date: signedDateShort,
        signatureUrl: stepSigUrl,
        isSigned: stepSigned,
      });
    });
  } else {
    // Blank official STI signatory template slots when approval chain is not yet populated
    signatoriesList.push(
      { id: 'sig_chk', type: 'Checked By:', name: '', role: '(Accountant)', date: '' },
      { id: 'sig_ind', type: 'Indorsed By:', name: '', role: '(Supervisor)', date: '' },
      { id: 'sig_rec', type: 'Recommending Approval:', name: '', role: '(Supervisor)', date: '' },
      { id: 'sig_app', type: 'Approved By:', name: '', role: '(Administrator)', date: '' },
      { id: 'sig_not', type: 'Noted By:', name: '', role: '(President)', date: '' }
    );
  }

  return signatoriesList;
}

export interface XlsxSignatoryPlacement {
  nameRow: number; // 1-indexed Excel row containing signatory name
  signatureUrl: string;
  name: string;
}

/**
 * Generates an Office Open XML (.xlsx) workbook + signatory row placements
 * matching LIQUIDATION-FORMAT_v1 (2) - Copy.xlsx with identical fonts, sizes,
 * borders, formulas, column widths, row heights, and signatory layout.
 */
export function buildOfficialStiLiquidationWorkbookWithMeta(
  report: LiquidationDocument,
  options: StiLiquidationExcelOptions = {}
): { wb: any; signatoryPlacements: XlsxSignatoryPlacement[] } {
  const header = resolveHeaderComputedValues(report, options);
  const groupedCategories = groupLiquidationData(report, options);
  const officialSignatories = resolveOfficialSignatories(report, options);
  const signatoryPlacements: XlsxSignatoryPlacement[] = [];

  const wb = XLSX.utils.book_new();
  const ws: any = {};

  // Fonts matching LIQUIDATION-FORMAT_v1 (2) - Copy.xlsx
  const fontTitle = { name: 'Calibri', sz: 12, bold: true, underline: true };
  const fontHeaderUnderline = { name: 'Calibri', sz: 10, bold: true, underline: true };
  const fontRegular = { name: 'Calibri', sz: 10 };
  const fontBold = { name: 'Calibri', sz: 10, bold: true };
  const fontBoldItalic = { name: 'Calibri', sz: 10, bold: true, italic: true };
  const fontBoldUnderline = { name: 'Calibri', sz: 10, bold: true, underline: true };
  const fontRemark = { name: 'Calibri', sz: 12, bold: true };
  const fontArialHeaderSub = { name: 'Arial', sz: 10, bold: true };
  const fontOrNo = { name: 'Arial', sz: 8, bold: true, italic: true };
  const fontSigRegular = { name: 'Arial', sz: 10 };
  const fontSigBold = { name: 'Arial', sz: 10, bold: true };
  const fontSigItalic = { name: 'Arial', sz: 10, italic: true };

  // Borders matching LIQUIDATION-FORMAT_v1 (2) - Copy.xlsx
  const black = { rgb: '000000' };
  const thinEdge = { style: 'thin', color: black };
  const mediumEdge = { style: 'medium', color: black };
  const doubleEdge = { style: 'double', color: black };

  const borderThin = { top: thinEdge, bottom: thinEdge, left: thinEdge, right: thinEdge };
  const borderThinBottom = { bottom: thinEdge };
  const borderMediumBottom = { bottom: mediumEdge };
  const borderBalance = { top: thinEdge, bottom: doubleEdge };

  const numFmtPeso = '[$₱-3409]#,##0.00';
  const numFmtAccounting = '_(* #,##0.00_);_(* (#,##0.00);_(* "-"??_);_(@_)';

  const rowHeights: Array<{ hpt: number } | undefined> = [];
  const setRowHeight = (excelRow1Based: number, hpt: number) => {
    rowHeights[excelRow1Based - 1] = { hpt };
  };

  // Row 1: Title (A1:G1) — Calibri 12pt Bold Underline
  setRowHeight(1, 15.75);
  ws['A1'] = {
    v: `LIQUIDATION REPORT FOR ${header.eventTitleUpper}`,
    t: 's',
    s: { font: fontTitle, alignment: { horizontal: 'center', vertical: 'center' } },
  };

  // Rows 2-6: Official Header Metadata — Calibri 10pt Bold Underline
  ws['A2'] = {
    v: `Employee Name:    ${header.officerName}`,
    t: 's',
    s: { font: fontHeaderUnderline, alignment: { horizontal: 'left', vertical: 'center' } },
  };
  ws['C2'] = {
    v: `Date Of Activity End:     ${header.activityEndDate}`,
    t: 's',
    s: { font: fontHeaderUnderline, alignment: { horizontal: 'left', vertical: 'center' } },
  };

  ws['A3'] = {
    v: `Cheque Number:    ${header.chequeNumber}`,
    t: 's',
    s: { font: fontHeaderUnderline, alignment: { horizontal: 'left', vertical: 'center' } },
  };
  ws['C3'] = {
    v: `Deadline For The Liquidation Submissions:     ${header.submissionDeadline}`,
    t: 's',
    s: { font: fontHeaderUnderline, alignment: { horizontal: 'left', vertical: 'center' } },
  };

  ws['A4'] = {
    v: `Purpose:     ${header.eventTitleUpper}`,
    t: 's',
    s: { font: fontHeaderUnderline, alignment: { horizontal: 'left', vertical: 'center' } },
  };
  ws['C4'] = {
    v: `Date Submitted:   ${header.dateSubmitted}`,
    t: 's',
    s: { font: fontHeaderUnderline, alignment: { horizontal: 'left', vertical: 'center' } },
  };

  const formattedAmountHeader = header.amountAdvanced.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  ws['A5'] = {
    v: `Amount:    P ${formattedAmountHeader}`,
    t: 's',
    s: { font: fontHeaderUnderline, alignment: { horizontal: 'left', vertical: 'center' } },
  };
  ws['C5'] = {
    v: `No. Of Days Lapse:   ${header.daysLapsed}`,
    t: 's',
    s: { font: fontHeaderUnderline, alignment: { horizontal: 'left', vertical: 'center' } },
  };

  ws['A6'] = {
    v: `Date Released:    ${header.dateReleased}`,
    t: 's',
    s: { font: fontHeaderUnderline, alignment: { horizontal: 'left', vertical: 'center' } },
  };

  // Row 8: CHARGE TO EXPENSE/REFUNDABLE ACCOUNT
  setRowHeight(8, 15.75);
  ws['A8'] = {
    v: 'CHARGE TO EXPENSE/REFUNDABLE ACCOUNT:',
    t: 's',
    s: { font: fontHeaderUnderline, alignment: { horizontal: 'left', vertical: 'center' } },
  };
  ws['C8'] = {
    v: header.accountCharge,
    t: 's',
    s: { font: fontBold, border: borderMediumBottom },
  };
  ws['D8'] = { v: '', t: 's', s: { font: fontBold, border: borderMediumBottom } };

  setRowHeight(9, 15.75);

  // Row 10: Table Header Top (two-row frame without vertical merges, matching template)
  ws['A10'] = {
    v: 'PARTICULAR',
    t: 's',
    s: { font: fontBold, alignment: { horizontal: 'center', vertical: 'center' }, border: { left: mediumEdge, top: mediumEdge } },
  };
  ws['B10'] = {
    v: 'AMOUNT',
    t: 's',
    s: { font: fontBold, alignment: { horizontal: 'center', vertical: 'center' }, border: { left: mediumEdge, right: mediumEdge, top: mediumEdge } },
  };
  ws['C10'] = {
    v: '        ACTUAL EXPENSES BREAKDOWN',
    t: 's',
    s: { font: fontBold, alignment: { horizontal: 'center', vertical: 'center' }, border: { top: mediumEdge } },
  };
  ws['D10'] = { v: '', t: 's', s: { font: fontBold, alignment: { horizontal: 'center' }, border: { top: mediumEdge } } };
  ws['E10'] = { v: '', t: 's', s: { font: fontBold, alignment: { horizontal: 'center' }, border: { top: mediumEdge } } };
  ws['F10'] = { v: '', t: 's', s: { font: fontArialHeaderSub, border: { left: thinEdge, right: mediumEdge, top: mediumEdge } } };
  ws['G10'] = {
    v: 'Remarks/Reference',
    t: 's',
    s: { font: fontBold, alignment: { horizontal: 'center', vertical: 'center' }, border: { left: mediumEdge, right: mediumEdge, top: mediumEdge } },
  };

  // Row 11: Table Sub Header
  setRowHeight(11, 15.75);
  ws['A11'] = {
    v: ' Breakdown For Cash Advances',
    t: 's',
    s: { font: fontArialHeaderSub, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: { left: mediumEdge, bottom: mediumEdge } },
  };
  ws['B11'] = { v: '', t: 's', s: { font: fontRegular, alignment: { horizontal: 'center' }, border: { left: mediumEdge, right: mediumEdge, bottom: mediumEdge } } };
  ws['C11'] = { v: '', t: 's', s: { font: fontSigRegular, alignment: { horizontal: 'center' }, border: { bottom: mediumEdge } } };
  ws['D11'] = {
    v: 'Amount',
    t: 's',
    s: { font: fontBold, alignment: { horizontal: 'center', vertical: 'center' }, border: { bottom: mediumEdge } },
  };
  ws['E11'] = {
    v: 'Total Amount',
    t: 's',
    s: { font: fontBold, alignment: { horizontal: 'center', vertical: 'center' }, border: { bottom: mediumEdge } },
  };
  ws['F11'] = {
    v: 'Variance',
    t: 's',
    s: { font: fontBold, alignment: { horizontal: 'center', vertical: 'center' }, border: { left: thinEdge, right: mediumEdge, bottom: mediumEdge } },
  };
  ws['G11'] = { v: '', t: 's', s: { font: fontRegular, border: { left: mediumEdge, right: mediumEdge, bottom: mediumEdge } } };

  // Row 12: Inner table divider row matching template
  for (let c = 0; c < 7; c++) {
    const colLetter = String.fromCharCode(65 + c);
    ws[`${colLetter}12`] = {
      v: '',
      t: 's',
      s: {
        font: fontRegular,
        border: { left: thinEdge, right: thinEdge, bottom: thinEdge },
        ...(c === 1 || c === 3 || c === 4 || c === 5 ? { numFmt: numFmtAccounting } : {}),
      },
    };
  }

  // Data rows start at Row 13
  const categoryLetterPrefixes = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P'];
  const firstDataRow = 13;
  let currentRow = 13;
  let totalBaselineSum = 0;
  let totalActualSum = 0;

  groupedCategories.forEach((catGroup, catIdx) => {
    const letter = categoryLetterPrefixes[catIdx] || `${catIdx + 1}`;
    const hasLetterPrefix = /^[A-Za-z]\.\s+/.test(catGroup.categoryTitle);
    const categoryParticular = hasLetterPrefix ? catGroup.categoryTitle : `${letter}. ${catGroup.categoryTitle}`;
    const baseline = Number(catGroup.baselineAmount || 0);
    totalBaselineSum += baseline;

    if (catGroup.items.length === 0) {
      const r = currentRow;
      setRowHeight(r, 15.75);
      ws[`A${r}`] = {
        v: categoryParticular,
        t: 's',
        s: { font: fontBold, alignment: { vertical: 'center', wrapText: true }, border: borderThin },
      };
      ws[`B${r}`] = {
        v: baseline > 0 ? baseline : '',
        t: baseline > 0 ? 'n' : 's',
        z: numFmtPeso,
        s: { font: fontBold, alignment: { vertical: 'center' }, border: borderThin, numFmt: numFmtPeso },
      };
      ws[`C${r}`] = {
        v: '—',
        t: 's',
        s: { font: fontBold, alignment: { horizontal: 'left', vertical: 'center', wrapText: true }, border: borderThin },
      };
      ws[`D${r}`] = {
        v: 0,
        t: 'n',
        z: numFmtPeso,
        s: { font: fontBold, alignment: { horizontal: 'right', vertical: 'center' }, border: borderThin, numFmt: numFmtPeso },
      };
      ws[`E${r}`] = {
        f: `D${r}`,
        v: 0,
        t: 'n',
        z: numFmtAccounting,
        s: { font: fontBold, alignment: { vertical: 'center' }, border: borderThin, numFmt: numFmtAccounting },
      };
      ws[`F${r}`] = {
        f: `B${r}-E${r}`,
        v: baseline,
        t: 'n',
        z: numFmtAccounting,
        s: { font: fontRegular, alignment: { vertical: 'center' }, border: borderThin, numFmt: numFmtAccounting },
      };
      ws[`G${r}`] = {
        v: '',
        t: 's',
        s: { font: fontRemark, alignment: { vertical: 'center', wrapText: true }, border: borderThin },
      };
      currentRow++;
    } else {
      const catStartRow = currentRow;
      const catEndRow = currentRow + catGroup.items.length - 1;
      const catActualSum = catGroup.items.reduce((s, it) => s + Number(it.totalCost || 0), 0);
      totalActualSum += catActualSum;
      const catVariance = baseline - catActualSum;

      catGroup.items.forEach((item, itemIdx) => {
        const r = currentRow;
        setRowHeight(r, 15.75);
        const isFirst = itemIdx === 0;
        const hasQtyMultiplier = item.quantity > 1 && item.unitCost > 0;
        const displayDesc = hasQtyMultiplier
          ? `${item.description} (${item.quantity} x ₱${item.unitCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`
          : item.description;
        const colDVal = hasQtyMultiplier ? item.unitCost : item.totalCost;
        const isExactProduct = hasQtyMultiplier && Math.abs(item.quantity * item.unitCost - item.totalCost) < 0.01;

        ws[`A${r}`] = {
          v: isFirst ? categoryParticular : '',
          t: 's',
          s: { font: fontBold, alignment: { vertical: 'center', wrapText: true }, border: borderThin },
        };
        ws[`B${r}`] =
          isFirst && baseline > 0
            ? {
                v: baseline,
                t: 'n',
                z: numFmtPeso,
                s: { font: fontBold, alignment: { vertical: 'center' }, border: borderThin, numFmt: numFmtPeso },
              }
            : { v: '', t: 's', s: { font: fontBold, border: borderThin, numFmt: numFmtPeso } };

        ws[`C${r}`] = {
          v: displayDesc,
          t: 's',
          s: {
            font: isFirst ? fontBold : fontBoldItalic,
            alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
            border: borderThin,
          },
        };
        ws[`D${r}`] = {
          v: colDVal,
          t: 'n',
          z: numFmtPeso,
          s: { font: fontBold, alignment: { horizontal: 'right', vertical: 'center' }, border: borderThin, numFmt: numFmtPeso },
        };
        ws[`E${r}`] = isFirst && !hasQtyMultiplier
          ? {
              f: `D${r}`,
              v: item.totalCost,
              t: 'n',
              z: numFmtAccounting,
              s: { font: fontBold, alignment: { vertical: 'center' }, border: borderThin, numFmt: numFmtAccounting },
            }
          : isExactProduct
            ? {
                f: `D${r}*${item.quantity}`,
                v: item.totalCost,
                t: 'n',
                z: numFmtAccounting,
                s: { font: fontBold, alignment: { vertical: 'center' }, border: borderThin, numFmt: numFmtAccounting },
              }
            : {
                v: item.totalCost,
                t: 'n',
                z: numFmtAccounting,
                s: { font: fontBold, alignment: { vertical: 'center' }, border: borderThin, numFmt: numFmtAccounting },
              };

        if (isFirst) {
          ws[`F${r}`] = {
            f: catEndRow > catStartRow
              ? `B${catStartRow}-SUM(E${catStartRow}:E${catEndRow})`
              : `B${catStartRow}-E${catStartRow}`,
            v: catVariance,
            t: 'n',
            z: numFmtAccounting,
            s: { font: fontRegular, alignment: { vertical: 'center' }, border: borderThin, numFmt: numFmtAccounting },
          };
        } else {
          ws[`F${r}`] = {
            v: '',
            t: 's',
            s: { font: fontRegular, border: borderThin, numFmt: numFmtAccounting },
          };
        }

        const refText = item.receiptNumber ? `OR #${item.receiptNumber}` : (item.vendorName || '');
        ws[`G${r}`] = {
          v: refText,
          t: 's',
          s: { font: fontRemark, alignment: { vertical: 'center', wrapText: true }, border: borderThin },
        };
        currentRow++;
      });
    }
  });

  // Maintain template minimum table grid down to Row 40
  const minGridEndRow = 40;
  while (currentRow <= minGridEndRow) {
    const r = currentRow;
    setRowHeight(r, 15.75);
    ['A', 'B', 'C', 'D', 'E', 'F', 'G'].forEach((col, colIdx) => {
      ws[`${col}${r}`] = {
        v: '',
        t: 's',
        s: {
          font: colIdx === 6 ? fontRemark : colIdx === 5 ? fontRegular : fontBold,
          border: borderThin,
          ...(colIdx === 1 || colIdx === 3 ? { numFmt: numFmtPeso } : {}),
          ...(colIdx === 4 || colIdx === 5 ? { numFmt: numFmtAccounting } : {}),
        },
      };
    });
    currentRow++;
  }

  const lastDataRow = currentRow - 1;
  const totalsRow = currentRow;

  // Totals Row (Row 41 in standard layout, ht=17.25)
  setRowHeight(totalsRow, 17.25);
  ws[`A${totalsRow}`] = {
    v: 'Total Cash Advance',
    t: 's',
    s: { font: fontBoldItalic, alignment: { horizontal: 'right', vertical: 'center' }, border: borderThin },
  };
  ws[`B${totalsRow}`] = {
    f: `SUM(B${firstDataRow}:B${lastDataRow})`,
    v: totalBaselineSum,
    t: 'n',
    z: numFmtPeso,
    s: { font: fontBoldUnderline, alignment: { vertical: 'center' }, border: borderThin, numFmt: numFmtPeso },
  };
  ws[`C${totalsRow}`] = {
    v: 'Total Actual Expense',
    t: 's',
    s: { font: fontBoldItalic, alignment: { horizontal: 'right', vertical: 'center' }, border: borderThin },
  };
  ws[`D${totalsRow}`] = {
    v: '',
    t: 's',
    s: { font: fontRegular, border: borderThin, numFmt: numFmtAccounting },
  };
  ws[`E${totalsRow}`] = {
    f: `SUM(E${firstDataRow}:E${lastDataRow})`,
    v: totalActualSum,
    t: 'n',
    z: numFmtAccounting,
    s: { font: fontBoldUnderline, alignment: { vertical: 'center' }, border: borderThin, numFmt: numFmtAccounting },
  };
  ws[`F${totalsRow}`] = {
    f: `B${totalsRow}-E${totalsRow}`,
    v: totalBaselineSum - totalActualSum,
    t: 'n',
    z: numFmtPeso,
    s: { font: fontBoldUnderline, alignment: { vertical: 'center' }, border: borderThin, numFmt: numFmtPeso },
  };
  ws[`G${totalsRow}`] = {
    v: '',
    t: 's',
    s: { font: fontRemark, border: borderThin },
  };
  currentRow++;

  // 3 blank bordered buffer rows below Totals Row (Rows 42-44 in template)
  for (let b = 0; b < 3; b++) {
    const r = currentRow;
    setRowHeight(r, 15.75);
    ['A', 'B', 'C', 'D', 'E', 'F', 'G'].forEach((col, colIdx) => {
      ws[`${col}${r}`] = {
        v: '',
        t: 's',
        s: {
          font: fontRegular,
          border: borderThin,
          ...(colIdx === 1 || colIdx === 3 || colIdx === 4 ? { numFmt: numFmtAccounting } : {}),
        },
      };
    });
    currentRow++;
  }

  // Note & Reconciliation Block (Rows 45-48 in template)
  const noteRow = currentRow;
  setRowHeight(noteRow, 15.75);
  ws[`A${noteRow}`] = { v: 'Note: ', t: 's', s: { font: fontRegular } };
  currentRow++;

  const advRow = currentRow;
  setRowHeight(advRow, 15.75);
  const useTotalsFormulaForAdvance = Math.abs(totalBaselineSum - header.amountAdvanced) < 0.01;
  ws[`A${advRow}`] = {
    v: '             Amount Advanced:',
    t: 's',
    s: { font: fontBold, alignment: { horizontal: 'right', vertical: 'center' } },
  };
  ws[`B${advRow}`] = useTotalsFormulaForAdvance
    ? {
        f: `B${totalsRow}`,
        v: header.amountAdvanced,
        t: 'n',
        z: numFmtPeso,
        s: { font: fontBold, alignment: { horizontal: 'right', vertical: 'center' }, numFmt: numFmtPeso },
      }
    : {
        v: header.amountAdvanced,
        t: 'n',
        z: numFmtPeso,
        s: { font: fontBold, alignment: { horizontal: 'right', vertical: 'center' }, numFmt: numFmtPeso },
      };
  currentRow++;

  const expRow = currentRow;
  setRowHeight(expRow, 15.75);
  ws[`A${expRow}`] = {
    v: '          Total Actual Expense',
    t: 's',
    s: { font: fontBold, alignment: { horizontal: 'right', vertical: 'center' } },
  };
  ws[`B${expRow}`] = {
    f: `E${totalsRow}`,
    v: totalActualSum,
    t: 'n',
    z: numFmtAccounting,
    s: { font: fontBold, alignment: { horizontal: 'right', vertical: 'center' }, border: borderThinBottom, numFmt: numFmtAccounting },
  };
  currentRow++;

  const balRow = currentRow;
  setRowHeight(balRow, 16.5);
  ws[`A${balRow}`] = {
    v: '          Balance: ',
    t: 's',
    s: { font: fontBold, alignment: { horizontal: 'right', vertical: 'center' } },
  };
  ws[`B${balRow}`] = {
    f: `B${advRow}-B${expRow}`,
    v: header.amountAdvanced - totalActualSum,
    t: 'n',
    z: numFmtPeso,
    s: { font: fontBold, alignment: { horizontal: 'center', vertical: 'center' }, border: borderBalance, numFmt: numFmtPeso },
  };
  ws[`C${balRow}`] = {
    v: `OR NO: ${header.orNumber}`,
    t: 's',
    s: { font: fontOrNo, alignment: { horizontal: 'left', vertical: 'center' } },
  };
  currentRow++;

  // Optional Multi-Bucket / Surplus Return Allocation Breakdown rows
  const xlsxReturnRows = Array.isArray(report.surplusReturnAllocations) && report.surplusReturnAllocations.length > 0
    ? report.surplusReturnAllocations.map((r) => ({
        name: r.bucketName,
        pulled: Number(r.originalAllocatedAmount) || 0,
        returned: Number(r.returnAmount) || 0,
      }))
    : Array.isArray(report.allocations) && report.allocations.length > 0
      ? report.allocations.map((a) => ({
          name: a.bucketName,
          pulled: Number(a.allocatedAmount) || 0,
          returned: 0,
        }))
      : [];

  if (xlsxReturnRows.length > 0) {
    setRowHeight(currentRow, 15.75);
    ws[`A${currentRow}`] = {
      v: 'Source Allocation & Surplus Return:',
      t: 's',
      s: { font: fontBold, alignment: { horizontal: 'left', vertical: 'center' } },
    };
    currentRow++;
    xlsxReturnRows.forEach((row) => {
      setRowHeight(currentRow, 15.75);
      ws[`A${currentRow}`] = {
        v: `  • ${row.name}`,
        t: 's',
        s: { font: fontRegular, alignment: { horizontal: 'left', vertical: 'center' } },
      };
      ws[`B${currentRow}`] = {
        v: `Pulled: P ${row.pulled.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        t: 's',
        s: { font: fontRegular, alignment: { horizontal: 'right', vertical: 'center' } },
      };
      ws[`C${currentRow}`] = {
        v: `Returned: P ${row.returned.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        t: 's',
        s: { font: fontBold, alignment: { horizontal: 'left', vertical: 'center' } },
      };
      currentRow++;
    });
  }

  // 2 blank rows before signatories (Rows 49-50 in template)
  setRowHeight(currentRow, 16.5);
  currentRow++;
  setRowHeight(currentRow, 15.75);
  currentRow++;

  // Signatories Block matching Rows 51-76 of LIQUIDATION-FORMAT_v1 (2) - Copy.xlsx
  const sigMerges: Array<{ s: { r: number; c: number }; e: { r: number; c: number } }> = [];
  const allowSignatureImages = options.includeSignatures !== false;

  officialSignatories.forEach((sig, sIdx) => {
    const nameRow = currentRow;
    const isNoted = sig.type.toLowerCase().includes('noted');
    const sigUrl = allowSignatureImages ? cleanSig(sig.signatureUrl) : '';
    if (sigUrl) {
      // Give the blank row immediately above nameRow vertical clearance so the floating PNG signature fits cleanly above the name
      setRowHeight(nameRow - 1, 26);
      signatoryPlacements.push({
        nameRow,
        signatureUrl: sigUrl,
        name: sig.name || sig.type,
      });
    }
    setRowHeight(nameRow, 16.5);

    ws[`A${nameRow}`] = {
      v: sig.type,
      t: 's',
      s: { font: fontSigRegular, alignment: { horizontal: 'left', vertical: 'bottom' } },
    };
    ws[`B${nameRow}`] = {
      v: sig.name || '',
      t: 's',
      s: { font: isNoted ? fontSigBold : fontSigRegular, alignment: { horizontal: 'center', vertical: 'bottom' }, border: borderMediumBottom },
    };
    ws[`C${nameRow}`] = {
      v: '',
      t: 's',
      s: { border: borderMediumBottom },
    };
    ws[`E${nameRow}`] = {
      v: sig.date || '',
      t: 's',
      z: 'mm-dd-yy',
      s: { font: fontSigRegular, alignment: { horizontal: 'center', vertical: 'bottom' }, border: borderMediumBottom, numFmt: 'mm-dd-yy' },
    };

    sigMerges.push({ s: { r: nameRow - 1, c: 1 }, e: { r: nameRow - 1, c: 2 } });
    currentRow++;

    const roleRow = currentRow;
    setRowHeight(roleRow, 15.75);
    ws[`B${roleRow}`] = {
      v: sig.role || '',
      t: 's',
      s: { font: fontSigItalic, alignment: { horizontal: 'center', vertical: 'top' } },
    };
    ws[`E${roleRow}`] = {
      v: '(Date)',
      t: 's',
      s: { font: fontSigItalic, alignment: { horizontal: 'center', vertical: 'top' } },
    };
    sigMerges.push({ s: { r: roleRow - 1, c: 1 }, e: { r: roleRow - 1, c: 2 } });
    currentRow++;

    // 2 blank rows between signatories (matching template rows 53-54, 57-58, 61-62, 65-66, 69-70)
    if (sIdx < officialSignatories.length - 1) {
      setRowHeight(currentRow, 15.75);
      currentRow++;
      setRowHeight(currentRow, 15.75);
      currentRow++;
    }
  });

  ws['!ref'] = `A1:G${Math.max(currentRow - 1, 1)}`;

  // Exact column widths from LIQUIDATION-FORMAT_v1 (2) - Copy.xlsx
  ws['!cols'] = [
    { wch: 37.57 },
    { wch: 11.86 },
    { wch: 34.57 },
    { wch: 11.86 },
    { wch: 11.71 },
    { wch: 10.86 },
    { wch: 25.71 },
  ];

  ws['!rows'] = rowHeights;

  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }, // A1:G1
    { s: { r: 9, c: 2 }, e: { r: 9, c: 4 } }, // C10:E10 ACTUAL EXPENSES BREAKDOWN
    ...sigMerges,
  ];

  ws['!margins'] = { left: 0.7, right: 0.7, top: 0.25, bottom: 0.25, header: 0.3, footer: 0.3 };

  XLSX.utils.book_append_sheet(wb, ws, 'Liquidation Format');

  return { wb, signatoryPlacements };
}

export function buildOfficialStiLiquidationWorkbook(
  report: LiquidationDocument,
  options: StiLiquidationExcelOptions = {}
) {
  return buildOfficialStiLiquidationWorkbookWithMeta(report, options).wb;
}

interface LoadedPngAsset {
  bytes: Uint8Array;
  width: number;
  height: number;
}

function decodeBase64ToBytes(b64: string): Uint8Array {
  if (typeof atob === 'function') {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

function readPngDimensions(bytes: Uint8Array): { width: number; height: number } {
  // Standard PNG signature + IHDR chunk (width at bytes 16..19, height at 20..23)
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    const width = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
    const height = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
    if (width > 0 && height > 0) return { width, height };
  }
  return { width: 300, height: 100 };
}

async function normalizeSourceToDataUrl(rawUrl: string): Promise<string | null> {
  const cleaned = cleanSig(rawUrl).replace(/\s+/g, '');
  if (!cleaned) return null;

  if (cleaned.startsWith('data:image/')) {
    return cleaned;
  }

  // Handle raw base64 without data URI prefix
  if (/^[A-Za-z0-9+/=]{80,}$/.test(cleaned) && !cleaned.startsWith('http')) {
    return `data:image/png;base64,${cleaned}`;
  }

  if (typeof fetch !== 'undefined' && (cleaned.startsWith('http://') || cleaned.startsWith('https://') || cleaned.startsWith('blob:'))) {
    try {
      const resp = await fetch(cleaned);
      if (resp.ok) {
        const blob = await resp.blob();
        if (typeof FileReader !== 'undefined') {
          const dataUrl = await new Promise<string | null>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
          });
          if (dataUrl) return dataUrl;
        }
      }
    } catch {
      // fall through
    }
  }

  return null;
}

async function loadSignaturePngAsset(rawUrl: string): Promise<LoadedPngAsset | null> {
  const dataUrl = await normalizeSourceToDataUrl(rawUrl);
  if (!dataUrl || !dataUrl.startsWith('data:image/')) return null;

  // Browser path: draw onto canvas to convert any format (JPEG/WebP/SVG/PNG) into clean PNG bytes with natural pixel size
  if (typeof document !== 'undefined' && typeof Image !== 'undefined') {
    const rendered = await new Promise<LoadedPngAsset | null>((resolve) => {
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth || img.width || 300;
        const h = img.naturalHeight || img.height || 100;
        try {
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, w, h);
            const pngDataUrl = canvas.toDataURL('image/png');
            const commaIdx = pngDataUrl.indexOf(',');
            if (commaIdx > 0) {
              resolve({
                bytes: decodeBase64ToBytes(pngDataUrl.slice(commaIdx + 1)),
                width: w,
                height: h,
              });
              return;
            }
          }
        } catch {
          // fallback below if canvas fails
        }
        if (dataUrl.startsWith('data:image/png;base64,')) {
          const b = decodeBase64ToBytes(dataUrl.slice('data:image/png;base64,'.length));
          resolve({ bytes: b, width: w, height: h });
          return;
        }
        resolve(null);
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
    if (rendered) return rendered;
  }

  // Non-DOM / Node fallback for direct PNG data URLs
  if (dataUrl.startsWith('data:image/png;base64,')) {
    const bytes = decodeBase64ToBytes(dataUrl.slice('data:image/png;base64,'.length));
    const dims = readPngDimensions(bytes);
    return { bytes, width: dims.width, height: dims.height };
  }

  return null;
}

/**
 * Injects PNG e-signature images into an `.xlsx` buffer as OOXML Worksheet Drawings (`xl/drawings/drawing1.xml`),
 * anchored horizontally centered over Columns B:C right above each signed signatory's name row.
 */
async function embedSignatureImagesIntoXlsxBuffer(
  xlsxArrayBuffer: ArrayBuffer | Uint8Array,
  placements: XlsxSignatoryPlacement[]
): Promise<Uint8Array> {
  const inputBytes =
    xlsxArrayBuffer instanceof Uint8Array ? xlsxArrayBuffer : new Uint8Array(xlsxArrayBuffer);

  if (!placements || placements.length === 0) return inputBytes;

  const resolvedAssets = await Promise.all(
    placements.map(async (p) => {
      const asset = await loadSignaturePngAsset(p.signatureUrl);
      return asset ? { placement: p, asset } : null;
    })
  );
  const validItems = resolvedAssets.filter(
    (x): x is { placement: XlsxSignatoryPlacement; asset: LoadedPngAsset } => Boolean(x)
  );
  if (validItems.length === 0) return inputBytes;

  const zip = new PizZip(inputBytes);

  // EMU conversion: 1 px = 9525 EMU at 96 DPI.
  // Merged B (wch 11.86 ≈ 88px) + C (wch 34.57 ≈ 247px) = 335px total width.
  const EMU_PER_PX = 9525;
  const COL_B_PX = 88;
  const TOTAL_BC_PX = 335;
  const MAX_SIG_W = 140;
  const MAX_SIG_H = 34;

  const relEntries: string[] = [];
  const anchorEntries: string[] = [];

  validItems.forEach(({ placement, asset }, idx) => {
    const rId = `rId${idx + 1}`;
    const picId = idx + 1;
    const mediaPath = `xl/media/sig_${picId}.png`;
    zip.file(mediaPath, asset.bytes);

    relEntries.push(
      `  <Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/sig_${picId}.png"/>`
    );

    const scale = Math.min(MAX_SIG_W / Math.max(1, asset.width), MAX_SIG_H / Math.max(1, asset.height));
    const fitW = Math.max(24, Math.round(asset.width * scale));
    const fitH = Math.max(12, Math.round(asset.height * scale));

    const startPxInBC = Math.max(0, Math.round((TOTAL_BC_PX - fitW) / 2));
    const col = startPxInBC >= COL_B_PX ? 2 : 1; // 0-indexed: 1 = Col B, 2 = Col C
    const colOffPx = startPxInBC >= COL_B_PX ? startPxInBC - COL_B_PX : startPxInBC;

    // Anchor inside the enlarged 26pt (~34.7px) blank row directly above nameRow (1-indexed nameRow - 1 => 0-indexed nameRow - 2)
    const anchorRow0 = Math.max(0, placement.nameRow - 2);
    const rowOffPx = Math.max(0, Math.round((35 - fitH) * 0.7));

    anchorEntries.push(
      `<xdr:oneCellAnchor>
    <xdr:from>
      <xdr:col>${col}</xdr:col>
      <xdr:colOff>${Math.round(colOffPx * EMU_PER_PX)}</xdr:colOff>
      <xdr:row>${anchorRow0}</xdr:row>
      <xdr:rowOff>${Math.round(rowOffPx * EMU_PER_PX)}</xdr:rowOff>
    </xdr:from>
    <xdr:ext cx="${Math.round(fitW * EMU_PER_PX)}" cy="${Math.round(fitH * EMU_PER_PX)}"/>
    <xdr:pic>
      <xdr:nvPicPr>
        <xdr:cNvPr id="${picId}" name="Signature ${picId} (${escapeXml(placement.name)})"/>
        <xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr>
      </xdr:nvPicPr>
      <xdr:blipFill>
        <a:blip r:embed="${rId}"/>
        <a:stretch><a:fillRect/></a:stretch>
      </xdr:blipFill>
      <xdr:spPr>
        <a:xfrm><a:off x="0" y="0"/><a:ext cx="${Math.round(fitW * EMU_PER_PX)}" cy="${Math.round(fitH * EMU_PER_PX)}"/></a:xfrm>
        <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
      </xdr:spPr>
    </xdr:pic>
    <xdr:clientData/>
  </xdr:oneCellAnchor>`
    );
  });

  zip.file(
    'xl/drawings/_rels/drawing1.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n${relEntries.join('\n')}\n</Relationships>`
  );

  zip.file(
    'xl/drawings/drawing1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">\n  ${anchorEntries.join('\n  ')}\n</xdr:wsDr>`
  );

  zip.file(
    'xl/worksheets/_rels/sheet1.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>\n</Relationships>`
  );

  const sheetFile = zip.file('xl/worksheets/sheet1.xml');
  if (sheetFile) {
    let sheetXml = sheetFile.asText();
    if (!sheetXml.includes('<drawing ')) {
      sheetXml = sheetXml.replace('</worksheet>', '<drawing r:id="rId1"/></worksheet>');
      zip.file('xl/worksheets/sheet1.xml', sheetXml);
    }
  }

  const ctFile = zip.file('[Content_Types].xml');
  if (ctFile) {
    let ctXml = ctFile.asText();
    if (!ctXml.includes('/xl/drawings/drawing1.xml')) {
      ctXml = ctXml.replace(
        '</Types>',
        '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>'
      );
      zip.file('[Content_Types].xml', ctXml);
    }
  }

  return zip.generate({ type: 'uint8array' });
}

/**
 * Generates the final `.xlsx` binary bytes including embedded PNG signature drawings
 * for the Maker and any already-signed Signatories.
 */
export async function buildOfficialStiLiquidationXlsxBytes(
  report: LiquidationDocument,
  options: StiLiquidationExcelOptions = {}
): Promise<Uint8Array> {
  const enrichedReport = await enrichLiquidationSignatures(report, options);
  const effectiveOptions: StiLiquidationExcelOptions = {
    ...options,
    // Re-resolve signatories from the enriched report unless explicit signatories already carry signatureUrl
    signatories: options.signatories
      ? resolveOfficialSignatories(enrichedReport, { ...options, signatories: undefined }).map((resolvedSig, idx) => {
          const overrideSig = options.signatories?.[idx];
          if (!overrideSig) return resolvedSig;
          return {
            ...overrideSig,
            signatureUrl: cleanSig(overrideSig.signatureUrl) || cleanSig(resolvedSig.signatureUrl),
          };
        })
      : undefined,
  };

  const { wb, signatoryPlacements } = buildOfficialStiLiquidationWorkbookWithMeta(
    enrichedReport,
    effectiveOptions
  );
  const rawBuffer: Uint8Array | ArrayBuffer = XLSX.write(wb, {
    type: 'array',
    bookType: 'xlsx',
  });

  if (options.includeSignatures === false || signatoryPlacements.length === 0) {
    return rawBuffer instanceof Uint8Array ? rawBuffer : new Uint8Array(rawBuffer);
  }

  return embedSignatureImagesIntoXlsxBuffer(rawBuffer, signatoryPlacements);
}

export async function exportOfficialStiLiquidationXlsx(
  report: LiquidationDocument,
  options: StiLiquidationExcelOptions = {}
) {
  const xlsxBytes = await buildOfficialStiLiquidationXlsxBytes(report, options);
  const cleanFilename = (report.eventTitle || 'Activity').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 35);
  const blob = new Blob([xlsxBytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${cleanFilename}_Financial_Liquidation.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Exports to XML Spreadsheet 2003 (.xls) matching the exact STI template
 * fonts, font sizes, borders, column widths, variance/balance formulas, and signatories.
 */
export function exportOfficialStiLiquidationXml(
  report: LiquidationDocument,
  options: StiLiquidationExcelOptions = {}
) {
  const header = resolveHeaderComputedValues(report, options);
  const groupedCategories = groupLiquidationData(report, options);
  const officialSignatories = resolveOfficialSignatories(report, options);

  const categoryLetterPrefixes = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P'];
  let currentRow = 13;
  let expenseRowsXml = '';
  let totalBaselineSum = 0;
  let totalActualSum = 0;

  groupedCategories.forEach((catGroup, catIdx) => {
    const letter = categoryLetterPrefixes[catIdx] || `${catIdx + 1}`;
    const hasLetterPrefix = /^[A-Za-z]\.\s+/.test(catGroup.categoryTitle);
    const categoryTitle = hasLetterPrefix ? catGroup.categoryTitle : `${letter}. ${catGroup.categoryTitle}`;
    const baseline = Number(catGroup.baselineAmount || 0);
    totalBaselineSum += baseline;

    if (catGroup.items.length === 0) {
      const r = currentRow++;
      expenseRowsXml += `
   <Row ss:Index="${r}" ss:Height="15.75">
    <Cell ss:StyleID="CategoryCell"><Data ss:Type="String">${escapeXml(categoryTitle)}</Data></Cell>
    <Cell ss:StyleID="CurrencyBoldCell">${baseline > 0 ? `<Data ss:Type="Number">${baseline}</Data>` : '<Data ss:Type="String"></Data>'}</Cell>
    <Cell ss:StyleID="ItemDescPrimary"><Data ss:Type="String">—</Data></Cell>
    <Cell ss:StyleID="CurrencyBoldCell"><Data ss:Type="Number">0</Data></Cell>
    <Cell ss:StyleID="AccountingBoldCell" ss:Formula="=RC[-1]"><Data ss:Type="Number">0</Data></Cell>
    <Cell ss:StyleID="VarianceCell" ss:Formula="=R${r}C2-R${r}C5"><Data ss:Type="Number">${baseline}</Data></Cell>
    <Cell ss:StyleID="RemarkCell"><Data ss:Type="String"></Data></Cell>
   </Row>`;
    } else {
      const catStartRow = currentRow;
      const catEndRow = currentRow + catGroup.items.length - 1;
      const catActualSum = catGroup.items.reduce((s, it) => s + Number(it.totalCost || 0), 0);
      totalActualSum += catActualSum;
      const catVariance = baseline - catActualSum;

      catGroup.items.forEach((item, itemIdx) => {
        const r = currentRow++;
        const isFirst = itemIdx === 0;
        const particularColA = isFirst ? categoryTitle : '';
        const particularAmount = isFirst && baseline > 0 ? baseline : '';

        const hasQtyMultiplier = item.quantity > 1 && item.unitCost > 0;
        const displayDesc = hasQtyMultiplier
          ? `${item.description} (${item.quantity} x ₱${item.unitCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`
          : item.description;
        const colDVal = hasQtyMultiplier ? item.unitCost : item.totalCost;
        const isExactProduct = hasQtyMultiplier && Math.abs(item.quantity * item.unitCost - item.totalCost) < 0.01;
        const colEFormula = !hasQtyMultiplier
          ? ' ss:Formula="=RC[-1]"'
          : isExactProduct
            ? ` ss:Formula="=RC[-1]*${item.quantity}"`
            : '';
        const varianceCell = isFirst
          ? `<Cell ss:StyleID="VarianceCell" ss:Formula="=${catEndRow > catStartRow ? `R${catStartRow}C2-SUM(R${catStartRow}C5:R${catEndRow}C5)` : `R${catStartRow}C2-R${catStartRow}C5`}"><Data ss:Type="Number">${catVariance}</Data></Cell>`
          : `<Cell ss:StyleID="VarianceCell"><Data ss:Type="String"></Data></Cell>`;
        const remarks = item.receiptNumber ? `OR #${item.receiptNumber}` : (item.vendorName || '');

        expenseRowsXml += `
   <Row ss:Index="${r}" ss:Height="15.75">
    <Cell ss:StyleID="CategoryCell"><Data ss:Type="String">${escapeXml(particularColA)}</Data></Cell>
    <Cell ss:StyleID="CurrencyBoldCell">${particularAmount !== '' ? `<Data ss:Type="Number">${particularAmount}</Data>` : '<Data ss:Type="String"></Data>'}</Cell>
    <Cell ss:StyleID="${isFirst ? 'ItemDescPrimary' : 'ItemDescSub'}"><Data ss:Type="String">${escapeXml(displayDesc)}</Data></Cell>
    <Cell ss:StyleID="CurrencyBoldCell"><Data ss:Type="Number">${colDVal}</Data></Cell>
    <Cell ss:StyleID="AccountingBoldCell"${colEFormula}><Data ss:Type="Number">${item.totalCost}</Data></Cell>
    ${varianceCell}
    <Cell ss:StyleID="RemarkCell"><Data ss:Type="String">${escapeXml(remarks)}</Data></Cell>
   </Row>`;
      });
    }
  });

  // Maintain minimum template grid down to Row 40
  while (currentRow <= 40) {
    const r = currentRow++;
    expenseRowsXml += `
   <Row ss:Index="${r}" ss:Height="15.75">
    <Cell ss:StyleID="CategoryCell"><Data ss:Type="String"></Data></Cell>
    <Cell ss:StyleID="CurrencyBoldCell"><Data ss:Type="String"></Data></Cell>
    <Cell ss:StyleID="ItemDescPrimary"><Data ss:Type="String"></Data></Cell>
    <Cell ss:StyleID="CurrencyBoldCell"><Data ss:Type="String"></Data></Cell>
    <Cell ss:StyleID="AccountingBoldCell"><Data ss:Type="String"></Data></Cell>
    <Cell ss:StyleID="VarianceCell"><Data ss:Type="String"></Data></Cell>
    <Cell ss:StyleID="RemarkCell"><Data ss:Type="String"></Data></Cell>
   </Row>`;
  }

  const firstDataRow = 13;
  const lastDataRow = currentRow - 1;
  const totalsRow = currentRow++;

  const totalAdvanceFormula = `=SUM(R${firstDataRow}C2:R${lastDataRow}C2)`;
  const totalActualFormula = `=SUM(R${firstDataRow}C5:R${lastDataRow}C5)`;
  const varianceFormula = `=R${totalsRow}C2-R${totalsRow}C5`;

  // 3 blank bordered buffer rows after Totals Row
  let bufferRowsXml = '';
  for (let b = 0; b < 3; b++) {
    const r = currentRow++;
    bufferRowsXml += `
   <Row ss:Index="${r}" ss:Height="15.75">
    <Cell ss:StyleID="VarianceCell"/>
    <Cell ss:StyleID="VarianceCell"/>
    <Cell ss:StyleID="VarianceCell"/>
    <Cell ss:StyleID="VarianceCell"/>
    <Cell ss:StyleID="VarianceCell"/>
    <Cell ss:StyleID="VarianceCell"/>
    <Cell ss:StyleID="VarianceCell"/>
   </Row>`;
  }

  const noteHeaderRow = currentRow++;
  const amountAdvancedRow = currentRow++;
  const actualExpenseSummaryRow = currentRow++;
  const balanceRow = currentRow++;
  const useTotalsFormulaForAdvance = Math.abs(totalBaselineSum - header.amountAdvanced) < 0.01;
  const balanceVal = header.amountAdvanced - totalActualSum;

  const xmlAllocRows = Array.isArray(report.surplusReturnAllocations) && report.surplusReturnAllocations.length > 0
    ? report.surplusReturnAllocations.map((r) => ({
        name: r.bucketName,
        pulled: Number(r.originalAllocatedAmount) || 0,
        returned: Number(r.returnAmount) || 0,
      }))
    : Array.isArray(report.allocations) && report.allocations.length > 0
      ? report.allocations.map((a) => ({
          name: a.bucketName,
          pulled: Number(a.allocatedAmount) || 0,
          returned: 0,
        }))
      : [];

  let allocationBreakdownXml = '';
  if (xmlAllocRows.length > 0) {
    const allocHeaderRow = currentRow++;
    allocationBreakdownXml += `
   <Row ss:Index="${allocHeaderRow}" ss:Height="15.75">
    <Cell ss:StyleID="NoteTitle"><Data ss:Type="String">Source Allocation &amp; Surplus Return:</Data></Cell>
   </Row>`;
    xmlAllocRows.forEach((r) => {
      const rIdx = currentRow++;
      allocationBreakdownXml += `
   <Row ss:Index="${rIdx}" ss:Height="15.75">
    <Cell ss:StyleID="Default"><Data ss:Type="String">  • ${escapeXml(r.name)}</Data></Cell>
    <Cell ss:StyleID="Default"><Data ss:Type="String">Pulled: P ${r.pulled.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Data></Cell>
    <Cell ss:StyleID="NoteLabel"><Data ss:Type="String">Returned: P ${r.returned.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Data></Cell>
   </Row>`;
    });
  }

  let signaturesXml = '';
  let sigStartRow = currentRow + 2;
  officialSignatories.forEach((sig, sIdx) => {
    const titleRow = sigStartRow++;
    const roleRow = sigStartRow++;
    if (sIdx < officialSignatories.length - 1) {
      sigStartRow += 2; // 2 blank rows between signatories
    }
    const isNoted = sig.type.toLowerCase().includes('noted');

    signaturesXml += `
   <Row ss:Index="${titleRow}" ss:Height="16.5">
    <Cell ss:StyleID="SigHeader"><Data ss:Type="String">${escapeXml(sig.type)}</Data></Cell>
    <Cell ss:MergeAcross="1" ss:StyleID="${isNoted ? 'SigNameBoldUnderline' : 'SigNameUnderline'}"><Data ss:Type="String">${escapeXml(sig.name)}</Data></Cell>
    <Cell ss:StyleID="Default"/>
    <Cell ss:StyleID="SigDateLine"><Data ss:Type="String">${escapeXml(sig.date || '')}</Data></Cell>
   </Row>
   <Row ss:Index="${roleRow}" ss:Height="15.75">
    <Cell ss:StyleID="Default"/>
    <Cell ss:MergeAcross="1" ss:StyleID="SigRoleText"><Data ss:Type="String">${escapeXml(sig.role)}</Data></Cell>
    <Cell ss:StyleID="Default"/>
    <Cell ss:StyleID="SigRoleText"><Data ss:Type="String">(Date)</Data></Cell>
   </Row>`;
  });

  const formattedAmountHeader = header.amountAdvanced.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
  <Author>STI Sync Platform</Author>
  <LastAuthor>STI Sync Platform</LastAuthor>
  <Created>${new Date().toISOString()}</Created>
  <Company>STI College</Company>
  <Version>16.00</Version>
 </DocumentProperties>
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Center"/>
   <Borders/>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#000000"/>
   <Interior/>
   <NumberFormat/>
   <Protection/>
  </Style>

  <Style ss:ID="MainTitle">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="12" ss:Bold="1" ss:Underline="Single" ss:Color="#000000"/>
  </Style>

  <Style ss:ID="HeaderMetaUnderline">
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Underline="Single" ss:Color="#000000"/>
  </Style>

  <Style ss:ID="ChargeLineBorder">
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#000000"/>
   </Borders>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#000000"/>
  </Style>

  <Style ss:ID="HdrTopLeft">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#000000"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#000000"/>
   </Borders>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#000000"/>
  </Style>

  <Style ss:ID="HdrTopBox">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#000000"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#000000"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#000000"/>
   </Borders>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#000000"/>
  </Style>

  <Style ss:ID="HdrTopSpan">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#000000"/>
   </Borders>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#000000"/>
  </Style>

  <Style ss:ID="HdrTopVariance">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#000000"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#000000"/>
   </Borders>
   <Font ss:FontName="Arial" ss:Size="10" ss:Bold="1" ss:Color="#000000"/>
  </Style>

  <Style ss:ID="HdrSubLeft">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#000000"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#000000"/>
   </Borders>
   <Font ss:FontName="Arial" ss:Size="10" ss:Bold="1" ss:Color="#000000"/>
  </Style>

  <Style ss:ID="HdrSubBox">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#000000"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#000000"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#000000"/>
   </Borders>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#000000"/>
  </Style>

  <Style ss:ID="HdrSubPlain">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#000000"/>
   </Borders>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#000000"/>
  </Style>

  <Style ss:ID="HdrSubVariance">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#000000"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#000000"/>
   </Borders>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#000000"/>
  </Style>

  <Style ss:ID="CategoryCell">
   <Alignment ss:Horizontal="Left" ss:Vertical="Center" ss:WrapText="1"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
   </Borders>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#000000"/>
  </Style>

  <Style ss:ID="ItemDescPrimary">
   <Alignment ss:Horizontal="Left" ss:Vertical="Center" ss:WrapText="1"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
   </Borders>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#000000"/>
  </Style>

  <Style ss:ID="ItemDescSub">
   <Alignment ss:Horizontal="Left" ss:Vertical="Center" ss:WrapText="1"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
   </Borders>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Italic="1" ss:Color="#000000"/>
  </Style>

  <Style ss:ID="CurrencyBoldCell">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
   </Borders>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#000000"/>
   <NumberFormat ss:Format="[$₱-3409]#,##0.00"/>
  </Style>

  <Style ss:ID="AccountingBoldCell">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
   </Borders>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#000000"/>
   <NumberFormat ss:Format="_(* #,##0.00_);_(* (#,##0.00);_(* &quot;-&quot;??_);_(@_)"/>
  </Style>

  <Style ss:ID="VarianceCell">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
   </Borders>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#000000"/>
   <NumberFormat ss:Format="_(* #,##0.00_);_(* (#,##0.00);_(* &quot;-&quot;??_);_(@_)"/>
  </Style>

  <Style ss:ID="RemarkCell">
   <Alignment ss:Horizontal="Left" ss:Vertical="Center" ss:WrapText="1"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
   </Borders>
   <Font ss:FontName="Calibri" ss:Size="12" ss:Bold="1" ss:Color="#000000"/>
  </Style>

  <Style ss:ID="TotalLabel">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
   </Borders>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Italic="1" ss:Color="#000000"/>
  </Style>

  <Style ss:ID="TotalAmountPeso">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
   </Borders>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Underline="Single" ss:Color="#000000"/>
   <NumberFormat ss:Format="[$₱-3409]#,##0.00"/>
  </Style>

  <Style ss:ID="TotalAmountAccounting">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
   </Borders>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Underline="Single" ss:Color="#000000"/>
   <NumberFormat ss:Format="_(* #,##0.00_);_(* (#,##0.00);_(* &quot;-&quot;??_);_(@_)"/>
  </Style>

  <Style ss:ID="NoteTitle">
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#000000"/>
  </Style>

  <Style ss:ID="NoteLabel">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#000000"/>
  </Style>

  <Style ss:ID="NotePesoValue">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#000000"/>
   <NumberFormat ss:Format="[$₱-3409]#,##0.00"/>
  </Style>

  <Style ss:ID="NoteExpenseValue">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
   </Borders>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#000000"/>
   <NumberFormat ss:Format="_(* #,##0.00_);_(* (#,##0.00);_(* &quot;-&quot;??_);_(@_)"/>
  </Style>

  <Style ss:ID="BalanceSummaryValue">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Double" ss:Weight="3" ss:Color="#000000"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
   </Borders>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#000000"/>
   <NumberFormat ss:Format="[$₱-3409]#,##0.00"/>
  </Style>

  <Style ss:ID="OrNoLabel">
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
   <Font ss:FontName="Arial" ss:Size="8" ss:Bold="1" ss:Italic="1" ss:Color="#000000"/>
  </Style>

  <Style ss:ID="SigHeader">
   <Alignment ss:Horizontal="Left" ss:Vertical="Bottom"/>
   <Font ss:FontName="Arial" ss:Size="10" ss:Color="#000000"/>
  </Style>
  <Style ss:ID="SigNameUnderline">
   <Alignment ss:Horizontal="Center" ss:Vertical="Bottom"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#000000"/>
   </Borders>
   <Font ss:FontName="Arial" ss:Size="10" ss:Color="#000000"/>
  </Style>
  <Style ss:ID="SigNameBoldUnderline">
   <Alignment ss:Horizontal="Center" ss:Vertical="Bottom"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#000000"/>
   </Borders>
   <Font ss:FontName="Arial" ss:Size="10" ss:Bold="1" ss:Color="#000000"/>
  </Style>
  <Style ss:ID="SigDateLine">
   <Alignment ss:Horizontal="Center" ss:Vertical="Bottom"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#000000"/>
   </Borders>
   <Font ss:FontName="Arial" ss:Size="10" ss:Color="#000000"/>
  </Style>
  <Style ss:ID="SigRoleText">
   <Alignment ss:Horizontal="Center" ss:Vertical="Top"/>
   <Font ss:FontName="Arial" ss:Size="10" ss:Italic="1" ss:Color="#000000"/>
  </Style>
 </Styles>

 <Worksheet ss:Name="Liquidation Format">
  <Table ss:ExpandedColumnCount="7" x:FullColumns="1" x:FullRows="1" ss:DefaultRowHeight="15">
   <Column ss:Index="1" ss:AutoFitWidth="0" ss:Width="205"/>
   <Column ss:Index="2" ss:AutoFitWidth="0" ss:Width="70"/>
   <Column ss:Index="3" ss:AutoFitWidth="0" ss:Width="190"/>
   <Column ss:Index="4" ss:AutoFitWidth="0" ss:Width="70"/>
   <Column ss:Index="5" ss:AutoFitWidth="0" ss:Width="70"/>
   <Column ss:Index="6" ss:AutoFitWidth="0" ss:Width="65"/>
   <Column ss:Index="7" ss:AutoFitWidth="0" ss:Width="140"/>

   <Row ss:Index="1" ss:Height="15.75">
    <Cell ss:MergeAcross="6" ss:StyleID="MainTitle">
     <Data ss:Type="String">LIQUIDATION REPORT FOR ${escapeXml(header.eventTitleUpper)}</Data>
    </Cell>
   </Row>

   <Row ss:Index="2">
    <Cell ss:StyleID="HeaderMetaUnderline"><Data ss:Type="String">Employee Name:    ${escapeXml(header.officerName)}</Data></Cell>
    <Cell ss:StyleID="Default"/>
    <Cell ss:StyleID="HeaderMetaUnderline"><Data ss:Type="String">Date Of Activity End:     ${escapeXml(header.activityEndDate)}</Data></Cell>
   </Row>

   <Row ss:Index="3">
    <Cell ss:StyleID="HeaderMetaUnderline"><Data ss:Type="String">Cheque Number:    ${escapeXml(header.chequeNumber)}</Data></Cell>
    <Cell ss:StyleID="Default"/>
    <Cell ss:StyleID="HeaderMetaUnderline"><Data ss:Type="String">Deadline For The Liquidation Submissions:     ${escapeXml(header.submissionDeadline)}</Data></Cell>
   </Row>

   <Row ss:Index="4">
    <Cell ss:StyleID="HeaderMetaUnderline"><Data ss:Type="String">Purpose:     ${escapeXml(header.eventTitleUpper)}</Data></Cell>
    <Cell ss:StyleID="Default"/>
    <Cell ss:StyleID="HeaderMetaUnderline"><Data ss:Type="String">Date Submitted:   ${escapeXml(header.dateSubmitted)}</Data></Cell>
   </Row>

   <Row ss:Index="5">
    <Cell ss:StyleID="HeaderMetaUnderline"><Data ss:Type="String">Amount:    P ${escapeXml(formattedAmountHeader)}</Data></Cell>
    <Cell ss:StyleID="Default"/>
    <Cell ss:StyleID="HeaderMetaUnderline"><Data ss:Type="String">No. Of Days Lapse:   ${escapeXml(header.daysLapsed)}</Data></Cell>
   </Row>

   <Row ss:Index="6">
    <Cell ss:StyleID="HeaderMetaUnderline"><Data ss:Type="String">Date Released:    ${escapeXml(header.dateReleased)}</Data></Cell>
   </Row>

   <Row ss:Index="8" ss:Height="15.75">
    <Cell ss:StyleID="HeaderMetaUnderline"><Data ss:Type="String">CHARGE TO EXPENSE/REFUNDABLE ACCOUNT:</Data></Cell>
    <Cell ss:StyleID="Default"/>
    <Cell ss:StyleID="ChargeLineBorder"><Data ss:Type="String">${escapeXml(header.accountCharge)}</Data></Cell>
    <Cell ss:StyleID="ChargeLineBorder"><Data ss:Type="String"></Data></Cell>
   </Row>

   <Row ss:Index="10">
    <Cell ss:StyleID="HdrTopLeft"><Data ss:Type="String">PARTICULAR</Data></Cell>
    <Cell ss:StyleID="HdrTopBox"><Data ss:Type="String">AMOUNT</Data></Cell>
    <Cell ss:MergeAcross="2" ss:StyleID="HdrTopSpan"><Data ss:Type="String">        ACTUAL EXPENSES BREAKDOWN</Data></Cell>
    <Cell ss:StyleID="HdrTopVariance"><Data ss:Type="String"></Data></Cell>
    <Cell ss:StyleID="HdrTopBox"><Data ss:Type="String">Remarks/Reference</Data></Cell>
   </Row>

   <Row ss:Index="11" ss:Height="15.75">
    <Cell ss:StyleID="HdrSubLeft"><Data ss:Type="String"> Breakdown For Cash Advances</Data></Cell>
    <Cell ss:StyleID="HdrSubBox"><Data ss:Type="String"></Data></Cell>
    <Cell ss:StyleID="HdrSubPlain"><Data ss:Type="String"></Data></Cell>
    <Cell ss:StyleID="HdrSubPlain"><Data ss:Type="String">Amount</Data></Cell>
    <Cell ss:StyleID="HdrSubPlain"><Data ss:Type="String">Total Amount</Data></Cell>
    <Cell ss:StyleID="HdrSubVariance"><Data ss:Type="String">Variance</Data></Cell>
    <Cell ss:StyleID="HdrSubBox"><Data ss:Type="String"></Data></Cell>
   </Row>

   <Row ss:Index="12">
    <Cell ss:StyleID="VarianceCell"/>
    <Cell ss:StyleID="VarianceCell"/>
    <Cell ss:StyleID="VarianceCell"/>
    <Cell ss:StyleID="VarianceCell"/>
    <Cell ss:StyleID="VarianceCell"/>
    <Cell ss:StyleID="VarianceCell"/>
    <Cell ss:StyleID="VarianceCell"/>
   </Row>

   ${expenseRowsXml}

   <Row ss:Index="${totalsRow}" ss:Height="17.25">
    <Cell ss:StyleID="TotalLabel"><Data ss:Type="String">Total Cash Advance</Data></Cell>
    <Cell ss:StyleID="TotalAmountPeso" ss:Formula="${totalAdvanceFormula}"><Data ss:Type="Number">${totalBaselineSum}</Data></Cell>
    <Cell ss:StyleID="TotalLabel"><Data ss:Type="String">Total Actual Expense</Data></Cell>
    <Cell ss:StyleID="VarianceCell"/>
    <Cell ss:StyleID="TotalAmountAccounting" ss:Formula="${totalActualFormula}"><Data ss:Type="Number">${totalActualSum}</Data></Cell>
    <Cell ss:StyleID="TotalAmountPeso" ss:Formula="${varianceFormula}"><Data ss:Type="Number">${totalBaselineSum - totalActualSum}</Data></Cell>
    <Cell ss:StyleID="RemarkCell"/>
   </Row>

   ${bufferRowsXml}

   <Row ss:Index="${noteHeaderRow}" ss:Height="15.75">
    <Cell ss:StyleID="NoteTitle"><Data ss:Type="String">Note: </Data></Cell>
   </Row>

   <Row ss:Index="${amountAdvancedRow}" ss:Height="15.75">
    <Cell ss:StyleID="NoteLabel"><Data ss:Type="String">             Amount Advanced:</Data></Cell>
    <Cell ss:StyleID="NotePesoValue"${useTotalsFormulaForAdvance ? ` ss:Formula="=R${totalsRow}C2"` : ''}><Data ss:Type="Number">${header.amountAdvanced}</Data></Cell>
   </Row>

   <Row ss:Index="${actualExpenseSummaryRow}" ss:Height="15.75">
    <Cell ss:StyleID="NoteLabel"><Data ss:Type="String">          Total Actual Expense</Data></Cell>
    <Cell ss:StyleID="NoteExpenseValue" ss:Formula="=R${totalsRow}C5"><Data ss:Type="Number">${totalActualSum}</Data></Cell>
   </Row>

   <Row ss:Index="${balanceRow}" ss:Height="16.5">
    <Cell ss:StyleID="NoteLabel"><Data ss:Type="String">          Balance: </Data></Cell>
    <Cell ss:StyleID="BalanceSummaryValue" ss:Formula="=R${amountAdvancedRow}C2-R${actualExpenseSummaryRow}C2"><Data ss:Type="Number">${balanceVal}</Data></Cell>
    <Cell ss:StyleID="OrNoLabel"><Data ss:Type="String">OR NO: ${escapeXml(header.orNumber)}</Data></Cell>
   </Row>

   ${allocationBreakdownXml}

   ${signaturesXml}

  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
   <PageSetup>
    <Layout x:Orientation="Portrait"/>
    <Header x:Margin="0.3"/>
    <Footer x:Margin="0.3"/>
    <PageMargins x:Bottom="0.25" x:Left="0.7" x:Right="0.7" x:Top="0.25"/>
   </PageSetup>
  </WorksheetOptions>
 </Worksheet>
</Workbook>`;

  const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const cleanFilename = (report.eventTitle || 'Activity').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 35);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${cleanFilename}_Financial_Liquidation.xls`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Main export handler: Defaults to official .xlsx format.
 */
export function exportOfficialStiLiquidationExcel(
  report: LiquidationDocument,
  options: StiLiquidationExcelOptions = {}
) {
  if (options.exportFormat === 'xls') {
    return exportOfficialStiLiquidationXml(report, options);
  }
  return exportOfficialStiLiquidationXlsx(report, options);
}
