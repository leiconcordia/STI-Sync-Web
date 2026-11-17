/**
 * Activity Proposal (AP) Word-Template Populator
 *
 * Maps `ActivityProposal` fields, implementation schedule (`tasks`), financial
 * projections (revenue, itemized expenses, balance), and maker/signatory digital
 * signature images directly into `/templates/ap_template.docx` (a tagged clone
 * of `docs/AP_FORMAT_EMPTY.docx`).
 */

import type { ActivityProposal, ProposalApprovalStep } from '../types/proposal.types';
import { resolveSignatoryLabel } from '../../signatories/utils/signatory-label.utils';
import { resolveUserSignature } from '../../signatories';
import { getSasSignatoryConfig } from '../../signatories/services/sas-signatory.service';
import {
  populateDocxTemplate,
  resolveSignatureDataUrl,
  tryConvertPopulatedDocxToPdf,
} from '../../workflow/utils/docx-template-engine';

const AP_TEMPLATE_URL = '/templates/ap_template.docx';

export interface APSignatoryTagItem {
  signatureImage: string | null;
  name: string;
  roleTitle: string;
}

export interface APTemplateData {
  submissionDate: string;
  activityTitle: string;
  description: string;
  organizers: string;
  objectives: string;
  successIndicators: string;
  mechanics: string;
  materials: string;
  targetMarket: string;
  estimatedAttendance: string;
  marketingPlan: string;
  documentationPlan: string;
  dateTime: string;
  venue: string;
  tasks: Array<{
    taskName: string;
    assignedPerson: string;
    completionDate: string;
  }>;
  revenueThisYearTotal: string;
  revenueTotalAmount: string;
  revenueAdjustmentTotal: string;
  revenueSummaryRemarks: string;
  revenues: Array<{
    description: string;
    lastYearActual: string;
    thisYearProposed: string;
    adjustment: string;
    remarks: string;
  }>;
  expensesThisYearTotal: string;
  expensesTotalAmount: string;
  expensesAdjustmentTotal: string;
  expensesSummaryRemarks: string;
  expenses: Array<{
    description: string;
    lastYearActual: string;
    thisYearProposed: string;
    adjustment: string;
    remarks: string;
  }>;
  balanceThisYearProposed: string;
  balanceTotalAmount: string;
  balanceAdjustment: string;
  balanceRemarks: string;
  proposedBy: APSignatoryTagItem[];
  endorsedBy: APSignatoryTagItem[];
  approvedBy: APSignatoryTagItem[];
}

function formatAmount(amount: number | undefined | null): string {
  if (amount === undefined || amount === null || Number.isNaN(amount)) return '';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDateLong(raw?: any): string {
  if (!raw) {
    return new Date().toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }
  try {
    if (typeof raw?.toDate === 'function') {
      return raw.toDate().toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
    }
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
    }
  } catch {}
  return String(raw);
}

function formatTime12(time24?: string): string {
  if (!time24) return '';
  const match = /^(\d{1,2}):(\d{2})$/.exec(time24.trim());
  if (!match) return time24;
  const h = Number(match[1]);
  const m = match[2];
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${suffix}`;
}

function formatBulletList(input: string | string[] | undefined): string {
  if (!input) return '';
  const items = (Array.isArray(input) ? input : String(input).split('\n'))
    .map((s) => s.replace(/^[\s•\-\*▪]+|^(\d+[\.\)]|\(\d+\))\s+/, '').trim())
    .filter(Boolean);
  if (items.length === 0) return '';
  if (items.length === 1 && items[0].toLowerCase() === 'none') return 'None';
  return items.map((item) => `• ${item}`).join('\n');
}

function formatDateAndTime(proposal: Partial<ActivityProposal>): string {
  if (proposal.sessions && proposal.sessions.length > 0) {
    return proposal.sessions
      .map((s) => {
        const dStr = s.date ? formatDateLong(s.date) : '';
        const tStr = s.startTime ? `${formatTime12(s.startTime)}${s.endTime ? ` – ${formatTime12(s.endTime)}` : ''}` : '';
        const label = s.title ? `${s.title}: ` : '';
        return `${label}${[dStr, tStr].filter(Boolean).join(', ')}`;
      })
      .filter(Boolean)
      .join('\n');
  }
  const dStr = proposal.date ? formatDateLong(proposal.date) : '';
  const tStr = proposal.startTime
    ? `${formatTime12(proposal.startTime)}${proposal.endTime ? ` – ${formatTime12(proposal.endTime)}` : ''}`
    : '';
  return [dStr, tStr].filter(Boolean).join(', ');
}

function formatTargetMarketText(proposal: Partial<ActivityProposal>): string {
  if (proposal.targetMarket?.trim()) return proposal.targetMarket.trim();
  if (proposal.targetAudience?.targetMarketSummary?.trim()) {
    return proposal.targetAudience.targetMarketSummary.trim();
  }
  const ta = proposal.targetAudience;
  if (!ta) return 'STI College Ormoc Students';
  if (ta.allStudents || ta.scope === 'all') {
    return ta.includeFaculty ? 'All STI Students, Faculty & Staff' : 'All STI Students';
  }
  const parts: string[] = [];
  if (ta.departments?.length) parts.push(ta.departments.join(', '));
  if (ta.courseCodes?.length) parts.push(ta.courseCodes.join(', '));
  if (ta.yearLevels?.length) parts.push(ta.yearLevels.join(', '));
  if (ta.customTargetMarkets?.length) {
    parts.push(ta.customTargetMarkets.map((c) => `${c.name} (${c.count})`).join(', '));
  }
  return parts.filter(Boolean).join(' • ') || 'STI College Ormoc Students';
}

export async function buildAPTemplatePayload(proposal: Partial<ActivityProposal>): Promise<{
  data: APTemplateData;
  imageDimensions: Map<string, [number, number]>;
}> {
  const imageDimensions = new Map<string, [number, number]>();
  const registerSignature = async (url?: string): Promise<string | null> => {
    const resolved = await resolveSignatureDataUrl(url);
    if (!resolved) return null;
    imageDimensions.set(resolved.dataUrl, [resolved.widthPx, resolved.heightPx]);
    return resolved.dataUrl;
  };

  const cleanSig = (val?: unknown): string => {
    if (typeof val !== 'string') return '';
    const trimmed = val.trim();
    if (!trimmed || trimmed.includes('[base64-')) return '';
    return trimmed;
  };

  const pAny = proposal as any;
  const creatorUid = pAny.submittedByUid || proposal.createdByUid || pAny.createdBy || '';
  const creatorEmail = (pAny.submittedByEmail || proposal.createdByEmail || '').trim();
  const orgIdLower = (proposal.organizationId || pAny.hostingOrgId || '').trim().toLowerCase();
  const isSasCreator =
    proposal.creatorRole === 'sas_admin' ||
    Boolean(pAny.isSasInternal) ||
    pAny.isOfficerProposal === false ||
    orgIdLower === 'sas' ||
    orgIdLower === 'sao_admin' ||
    orgIdLower === 'sao' ||
    creatorUid === 'sas_admin_user' ||
    creatorUid === 'sao_admin' ||
    (proposal.preparedBy?.roleTitle || '').toLowerCase().includes('sas') ||
    (proposal.preparedBy?.roleTitle || '').toLowerCase().includes('student affairs') ||
    creatorEmail.toLowerCase().includes('sas') ||
    creatorEmail.toLowerCase().includes('sao');

  const makerSigRaw =
    cleanSig(pAny.preparedBy?.signatureUrl) ||
    cleanSig(pAny.submittedBySignatureUrl) ||
    cleanSig(pAny.signatureUrl) ||
    undefined;

  let resolvedMakerSigUrl =
    makerSigRaw ||
    cleanSig(
      await resolveUserSignature({
        uid: creatorUid !== 'sas_admin_user' && creatorUid !== 'sao_admin' ? creatorUid : undefined,
        email: creatorEmail || undefined,
        name: pAny.preparedBy?.name || proposal.createdByName,
        role: isSasCreator
          ? 'sas_admin'
          : pAny.preparedBy?.roleTitle || (proposal.creatorRole === 'sas_admin' ? 'sas_admin' : 'Organization Adviser'),
      }).catch(() => '')
    );

  let resolvedMakerName =
    pAny.preparedBy?.name ||
    proposal.createdByName ||
    proposal.proponents?.[0]?.split('–')?.[0]?.trim() ||
    (isSasCreator ? 'SAS Administrator' : 'Club Adviser');
  let resolvedMakerRole =
    pAny.preparedBy?.roleTitle ||
    (isSasCreator ? 'SAS Administrator' : 'Organization Adviser');

  if (isSasCreator) {
    try {
      const sasCfg = await getSasSignatoryConfig();
      if (!resolvedMakerSigUrl) {
        resolvedMakerSigUrl = cleanSig(sasCfg.signatureUrl) || cleanSig(sasCfg.signatureDataUrl);
      }
      const lowerName = resolvedMakerName.trim().toLowerCase();
      if (
        (!lowerName ||
          lowerName.includes('sas / sao administrator') ||
          lowerName === 'sas administrator' ||
          lowerName === 'sao administrator' ||
          lowerName.includes('student affairs')) &&
        sasCfg.name
      ) {
        resolvedMakerName = sasCfg.name;
      }
      if ((!resolvedMakerRole || resolvedMakerRole === 'SAS Administrator' || resolvedMakerRole === 'System Administrator') && sasCfg.roleTitle) {
        resolvedMakerRole = sasCfg.roleTitle;
      }
    } catch {}
  }

  const makerSigImage = await registerSignature(resolvedMakerSigUrl);
  const proposedBy: APSignatoryTagItem[] = [
    {
      signatureImage: makerSigImage,
      name: resolvedMakerName,
      roleTitle: resolvedMakerRole,
    },
  ];

  const chain: ProposalApprovalStep[] = Array.isArray(proposal.approvalChain)
    ? proposal.approvalChain
    : [];

  const endorsedBy: APSignatoryTagItem[] = [];
  const approvedBy: APSignatoryTagItem[] = [];

  for (let i = 0; i < chain.length; i++) {
    const step = chain[i];
    const isLast = i === chain.length - 1;
    const label = (step.signatoryLabel || resolveSignatoryLabel(step, 'proposal', isLast)).toLowerCase();
    const isSigned =
      step.status === 'endorsed' ||
      step.status === 'approved' ||
      Boolean(step.signedAt);

    let sigUrl = isSigned ? cleanSig(step.signatureUrl) : '';
    if (isSigned && !sigUrl) {
      sigUrl = cleanSig(
        await resolveUserSignature({
          uid: step.signatoryUid,
          email: step.signatoryEmail,
          name: step.signatoryName,
          role: step.role,
        }).catch(() => '')
      );
    }

    const sigImg = isSigned ? await registerSignature(sigUrl) : null;
    const item: APSignatoryTagItem = {
      signatureImage: sigImg,
      name: step.signatoryName || 'Institutional Officer',
      roleTitle: step.roleTitle || 'Designated Signatory',
    };

    if (label.includes('approv') || step.actionType === 'approve') {
      approvedBy.push(item);
    } else {
      endorsedBy.push(item);
    }
  }

  const fin = proposal.financialProjections || {
    revenues: [],
    expenses: [],
    totalRevenue: 0,
    totalExpenses: 0,
    balance: 0,
  };
  const isZeroBudget = proposal.fundingSource === 'zero_budget';
  const rawRevs = !isZeroBudget && Array.isArray(fin.revenues) ? fin.revenues : [];
  const rawExps = Array.isArray(fin.expenses) ? fin.expenses : [];

  const revThisYearSum = rawRevs.reduce((acc, r) => acc + (Number(r.thisYearProposed) || 0), 0);
  const revAdjSum = rawRevs.reduce((acc, r) => acc + (Number(r.adjustment) || 0), 0);
  const expThisYearSum = rawExps.reduce((acc, e) => acc + (Number(e.thisYearProposed) || 0), 0);
  const expAdjSum = rawExps.reduce((acc, e) => acc + (Number(e.adjustment) || 0), 0);

  const rawTasks = Array.isArray(proposal.tasks) ? proposal.tasks : [];
  const tasks =
    rawTasks.length > 0
      ? rawTasks.map((t) => ({
          taskName: (t.taskName || '').trim(),
          assignedPerson: (t.assignedPerson || '').trim(),
          completionDate: t.completionDate ? formatDateLong(t.completionDate) : '',
        }))
      : Array.from({ length: 4 }, () => ({
          taskName: '',
          assignedPerson: '',
          completionDate: '',
        }));

  const balanceSign = (fin.balance || 0) < 0 ? '-' : '';
  const absBalance = Math.abs(fin.balance || 0);

  const estAtt =
    proposal.estimatedAttendance ||
    (proposal.estAttendanceCount
      ? `${proposal.estAttendanceCount} ${proposal.estAttendanceQualifier || 'Participants'}`
      : '');

  const allocList = Array.isArray((proposal as any).allocations) ? (proposal as any).allocations : [];
  const revenueSummaryRemarks =
    allocList.length > 0
      ? `Pulled Allocations: ${allocList
          .map((a: any) => `${a.bucketName} (P ${formatAmount(a.allocatedAmount)})`)
          .join(' + ')}`
      : '';

  const data: APTemplateData = {
    submissionDate: formatDateLong(proposal.submissionDate || new Date()),
    activityTitle: proposal.title || '',
    description: proposal.description || '',
    organizers:
      proposal.organizers && proposal.organizers.length > 0
        ? proposal.organizers.join(', ')
        : proposal.createdByName || 'Student Affairs & Services',
    objectives: formatBulletList(proposal.objectives),
    successIndicators: formatBulletList(proposal.successIndicators),
    mechanics: formatBulletList(proposal.mechanics),
    materials: formatBulletList(proposal.materials),
    targetMarket: formatTargetMarketText(proposal),
    estimatedAttendance: estAtt,
    marketingPlan: formatBulletList(proposal.marketingPlan),
    documentationPlan: formatBulletList(proposal.documentationPlan),
    dateTime: formatDateAndTime(proposal),
    venue:
      proposal.customVenueName ||
      proposal.venueName ||
      proposal.sessions?.[0]?.venueName ||
      'STI College Ormoc',
    tasks,
    revenueThisYearTotal: rawRevs.length > 0 ? formatAmount(revThisYearSum) : '',
    revenueTotalAmount: rawRevs.length > 0 ? formatAmount(fin.totalRevenue) : '',
    revenueAdjustmentTotal: rawRevs.length > 0 ? formatAmount(revAdjSum) : '',
    revenueSummaryRemarks,
    revenues: rawRevs.map((rev) => {
      const matchedAlloc =
        rev.id && String(rev.id).startsWith('rev-bucket-')
          ? allocList.find((a: any) => `rev-bucket-${a.bucketId}` === rev.id)
          : undefined;
      const allocNote = matchedAlloc
        ? `Pulled Allocation: P ${formatAmount(matchedAlloc.allocatedAmount)}`
        : '';
      const combinedRem = [rev.remarks, allocNote].filter(Boolean).join(' • ');
      return {
        description: rev.description || 'Revenue source',
        lastYearActual: rev.lastYearActual ? formatAmount(rev.lastYearActual) : '',
        thisYearProposed: rev.thisYearProposed ? formatAmount(rev.thisYearProposed) : '',
        adjustment: rev.adjustment ? formatAmount(rev.adjustment) : '',
        remarks: combinedRem,
      };
    }),
    expensesThisYearTotal: rawExps.length > 0 ? formatAmount(expThisYearSum) : '',
    expensesTotalAmount: formatAmount(fin.totalExpenses ?? 0),
    expensesAdjustmentTotal: rawExps.length > 0 ? formatAmount(expAdjSum) : '',
    expensesSummaryRemarks: '',
    expenses:
      rawExps.length > 0
        ? rawExps.map((exp) => ({
            description: exp.description || 'Expense item',
            lastYearActual: exp.lastYearActual !== undefined && exp.lastYearActual !== null ? formatAmount(exp.lastYearActual) : '',
            thisYearProposed: exp.thisYearProposed !== undefined && exp.thisYearProposed !== null ? formatAmount(exp.thisYearProposed) : '',
            adjustment: exp.adjustment !== undefined && exp.adjustment !== null ? formatAmount(exp.adjustment) : '',
            remarks: exp.remarks || '',
          }))
        : [{ description: '', lastYearActual: '', thisYearProposed: '', adjustment: '', remarks: '' }],
    balanceThisYearProposed: `P ${balanceSign}${formatAmount(absBalance)}`,
    balanceTotalAmount: `P ${balanceSign}${formatAmount(absBalance)}`,
    balanceAdjustment: '',
    balanceRemarks: '',
    proposedBy,
    endorsedBy,
    approvedBy,
  };

  return { data, imageDimensions };
}

export async function populateActivityProposalDocx(
  proposal: Partial<ActivityProposal>
): Promise<Blob> {
  const { data, imageDimensions } = await buildAPTemplatePayload(proposal);
  return populateDocxTemplate(AP_TEMPLATE_URL, data, imageDimensions);
}

export async function tryExportActivityProposalDocxPdf(
  proposal: Partial<ActivityProposal>,
  pdfFileName: string
): Promise<boolean> {
  const { data, imageDimensions } = await buildAPTemplatePayload(proposal);
  return tryConvertPopulatedDocxToPdf(AP_TEMPLATE_URL, data, imageDimensions, pdfFileName);
}
