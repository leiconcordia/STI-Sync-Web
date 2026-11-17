/**
 * Post-Activity Report (PAR) Word-Template Populator
 *
 * Maps `PostActivityReportDocument`, linked proposal/liquidation financial data,
 * categorized recommendations, VIII. Attachments checkboxes, and Prepared by /
 * Noted by digital signature images directly into `/templates/par_template.docx`
 * (a tagged clone of `docs/PAR_updated1.docx`).
 */

import type { PostActivityReportDocument, PARApprovalStep } from '../types/par.types';
import { resolveUserSignature } from '../../signatories';
import { getSasSignatoryConfig } from '../../signatories/services/sas-signatory.service';
import {
  populateDocxTemplate,
  resolveSignatureDataUrl,
  tryConvertPopulatedDocxToPdf,
} from '../../workflow/utils/docx-template-engine';

const PAR_TEMPLATE_URL = '/templates/par_template.docx';

export interface PARSignatoryTagItem {
  signatureImage: string | null;
  name: string;
  roleTitle: string;
}

export interface PARTemplateData {
  reportDate: string;
  activityTitle: string;
  description: string;
  organizers: string;
  actualMechanics: string;
  materials: string;
  howManyAttended: string;
  whoAttended: string;
  marketing: string;
  documentation: string;
  dateTime: string;
  venue: string;
  achievementOfObjectives: string;
  keyLearnings: string;
  classroomEnrichment: string;
  reasonForVenueSelection: string;
  foodLogisticsAssessment: string;
  scheduleCompliance: string;
  issuesEncountered: string;
  totalRevenue: string;
  revenues: Array<{
    description: string;
    unitAmount: string;
  }>;
  expenses: Array<{
    description: string;
    unitAmount: string;
  }>;
  totalExpenses: string;
  netBalance: string;
  remarksContent: string;
  chkAttendanceSheet: string;
  chkPhotosOfActivity: string;
  chkProgramInvitation: string;
  chkFeedbackEvaluation: string;
  chkCopiesOfCertificates: string;
  preparedBy: PARSignatoryTagItem[];
  notedBy: PARSignatoryTagItem[];
}

function formatAmount(amount: number | undefined | null): string {
  if (amount === undefined || amount === null || Number.isNaN(amount)) return '0.00';
  const abs = Math.abs(amount);
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(abs);
  return amount < 0 ? `(${formatted})` : formatted;
}

function formatDate(raw?: any): string {
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
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
    }
  } catch {}
  return String(raw);
}

function extractList(val: any): string[] {
  if (Array.isArray(val)) return val.map((v) => String(v).trim()).filter(Boolean);
  if (typeof val === 'string' && val.trim()) {
    return val
      .split('\n')
      .map((s) => s.replace(/^[•\-\*]\s*/, '').trim())
      .filter(Boolean);
  }
  return [];
}

function formatRemarksContent(report: PostActivityReportDocument): string {
  const categories = [
    { title: '1. Program Flow and Content', data: report.recommendations?.programFlow },
    { title: '2. Participant Engagement', data: report.recommendations?.participantEngagement },
    { title: '3. Technical Setup', data: report.recommendations?.technicalSetup },
    {
      title: '4. Participant Preparedness and Expectations',
      data: report.recommendations?.participantPreparedness,
    },
  ];

  const blocks: string[] = [];
  for (const cat of categories) {
    const obs = extractList((cat.data as any)?.observationsList || cat.data?.observations);
    const recs = extractList((cat.data as any)?.recommendationsList || cat.data?.recommendations);
    if (obs.length === 0 && recs.length === 0) continue;

    const lines: string[] = [cat.title];
    if (obs.length > 0) {
      lines.push('Observations:');
      obs.forEach((o) => lines.push(`• ${o}`));
    }
    if (recs.length > 0) {
      lines.push('Recommendations:');
      recs.forEach((r) => lines.push(`• ${r}`));
    }
    blocks.push(lines.join('\n'));
  }

  return blocks.join('\n\n');
}

export async function buildPARTemplatePayload(
  rawReport: PostActivityReportDocument,
  proposalData: any = null,
  liquidationData: any = null
): Promise<{
  data: PARTemplateData;
  imageDimensions: Map<string, [number, number]>;
}> {
  const imageDimensions = new Map<string, [number, number]>();
  const registerSignature = async (url?: string): Promise<string | null> => {
    const resolved = await resolveSignatureDataUrl(url);
    if (!resolved) return null;
    imageDimensions.set(resolved.dataUrl, [resolved.widthPx, resolved.heightPx]);
    return resolved.dataUrl;
  };

  const rAny = rawReport as any;
  const orgIdLower = (rawReport.organizationId || '').trim().toLowerCase();
  const isSasCreator =
    rawReport.creatorRole === 'sas_admin' ||
    Boolean(rawReport.isSasInternal) ||
    orgIdLower === 'sas' ||
    orgIdLower === 'sao_admin' ||
    orgIdLower === 'sao' ||
    rAny.createdByUid === 'sas_admin_user' ||
    rAny.createdByUid === 'sao_admin' ||
    (rawReport.preparedBy?.roleTitle || '').toLowerCase().includes('sas') ||
    (rawReport.preparedBy?.roleTitle || '').toLowerCase().includes('student affairs');

  let preparedName = rawReport.preparedBy?.name || rAny.submittedByName || rawReport.createdByName || '';
  let preparedRoleTitle =
    rawReport.preparedBy?.roleTitle ||
    rAny.submittedByRole ||
    (isSasCreator ? 'SAS Administrator' : '');
  let preparedSigUrl =
    rawReport.preparedBy?.signatureUrl || rawReport.submittedBySignatureUrl || rAny.signatureUrl || '';

  if (!preparedSigUrl) {
    preparedSigUrl = await resolveUserSignature({
      uid: rAny.submittedByUid || rawReport.createdByUid,
      email: rAny.submittedByEmail || rawReport.createdByEmail,
      name: preparedName,
      role: isSasCreator ? 'sas_admin' : preparedRoleTitle || rawReport.creatorRole || 'adviser',
    }).catch(() => '');
  }

  if (isSasCreator) {
    try {
      const sasCfg = await getSasSignatoryConfig();
      if (!preparedSigUrl) {
        preparedSigUrl = sasCfg.signatureUrl || sasCfg.signatureDataUrl || '';
      }
      const lowerName = preparedName.trim().toLowerCase();
      if (
        (!lowerName ||
          lowerName.includes('sas / sao administrator') ||
          lowerName === 'sas administrator' ||
          lowerName === 'sao administrator' ||
          lowerName.includes('student affairs')) &&
        sasCfg.name
      ) {
        preparedName = sasCfg.name;
      }
      if ((!preparedRoleTitle || preparedRoleTitle === 'SAS Administrator' || preparedRoleTitle === 'System Administrator') && sasCfg.roleTitle) {
        preparedRoleTitle = sasCfg.roleTitle;
      }
    } catch {}
  }

  const preparedSigImg = preparedSigUrl ? await registerSignature(preparedSigUrl) : null;

  const preparedBy: PARSignatoryTagItem[] = [
    {
      signatureImage: preparedSigImg,
      name: preparedName,
      roleTitle: preparedRoleTitle,
    },
  ];

  const chainSteps: PARApprovalStep[] = Array.isArray(rawReport.approvalChain)
    ? rawReport.approvalChain
    : [];

  const notedBy: PARSignatoryTagItem[] = [];
  for (const step of chainSteps) {
    const isSigned =
      step.status === 'endorsed' ||
      step.status === 'approved' ||
      Boolean(step.signedAt);
    let stepSigUrl = isSigned ? step.signatureUrl || '' : '';
    if (isSigned && !stepSigUrl) {
      stepSigUrl = await resolveUserSignature({
        uid: step.signatoryUid,
        email: step.signatoryEmail,
        name: step.signatoryName,
        role: step.role,
      }).catch(() => '');
    }
    const sigImg = isSigned && stepSigUrl ? await registerSignature(stepSigUrl) : null;
    notedBy.push({
      signatureImage: sigImg,
      name: step.signatoryName || '',
      roleTitle: step.roleTitle || '',
    });
  }

  const organizersList =
    Array.isArray(rawReport.proposalOrganizers) && rawReport.proposalOrganizers.length > 0
      ? rawReport.proposalOrganizers
      : Array.isArray(proposalData?.organizers) && proposalData.organizers.length > 0
      ? proposalData.organizers
      : [rawReport.organizerName || rawReport.organizationName || ''];

  const proposedMechanicsText = (rawReport.proposedMechanics || []).join('\n').trim();
  const trimmedActualMechanics = (rawReport.actualMechanics || '').trim();
  const didMechanicsDiffer =
    typeof rawReport.mechanicsDiffered === 'boolean'
      ? rawReport.mechanicsDiffered && Boolean(trimmedActualMechanics)
      : Boolean(
          trimmedActualMechanics &&
            trimmedActualMechanics.toLowerCase() !== 'same as proposed.' &&
            trimmedActualMechanics !== proposedMechanicsText
        );

  const actualMechanics = didMechanicsDiffer
    ? trimmedActualMechanics
    : 'Same as proposed.';

  const materialsList =
    Array.isArray(rawReport.proposalMaterials) && rawReport.proposalMaterials.length > 0
      ? rawReport.proposalMaterials
      : Array.isArray(rawReport.materialsUtilized) && rawReport.materialsUtilized.length > 0
      ? rawReport.materialsUtilized
      : Array.isArray(proposalData?.materials)
      ? proposalData.materials
      : [];

  const marketingList =
    Array.isArray(rawReport.proposalMarketingPlan) && rawReport.proposalMarketingPlan.length > 0
      ? rawReport.proposalMarketingPlan
      : Array.isArray(rawReport.marketingConducted) && rawReport.marketingConducted.length > 0
      ? rawReport.marketingConducted
      : Array.isArray(proposalData?.marketingPlan)
      ? proposalData.marketingPlan
      : [];

  const docPlanList =
    Array.isArray((rawReport as any).proposalDocumentationPlan) &&
    (rawReport as any).proposalDocumentationPlan.length > 0
      ? (rawReport as any).proposalDocumentationPlan
      : Array.isArray(rawReport.documentationPlan) && rawReport.documentationPlan.length > 0
      ? rawReport.documentationPlan
      : Array.isArray(proposalData?.documentationPlan)
      ? proposalData.documentationPlan
      : [];

  const howManyAttended =
    rawReport.attendanceSummary?.howManyAttended ||
    (rawReport.attendanceSummary?.attendedCount
      ? `${rawReport.attendanceSummary.attendedCount} Attendees`
      : '');
  const whoAttended =
    rawReport.attendanceSummary?.whoAttended ||
    rawReport.attendanceSummary?.targetAudience ||
    '';

  const totalRevenueNum = Number(
    rawReport.financialSummary?.totalRevenue ??
      liquidationData?.totalBudget ??
      liquidationData?.totalRevenue ??
      0
  );
  const totalDisbursedNum = Number(
    rawReport.financialSummary?.totalDisbursed ??
      liquidationData?.totalActualSpending ??
      0
  );
  const netBalanceNum = totalRevenueNum - totalDisbursedNum;

  const lineItems = Array.isArray(rawReport.financialSummary?.lineItems)
    ? rawReport.financialSummary.lineItems
    : [];

  const revenues =
    totalRevenueNum > 0
      ? [{ description: 'Collected Funds / Activity Revenue', unitAmount: formatAmount(totalRevenueNum) }]
      : [];

  const expenses =
    lineItems.length > 0
      ? lineItems.map((li) => ({
          description: li.description || 'Expense Item',
          unitAmount: formatAmount(li.totalAmount || li.unitAmount || 0),
        }))
      : totalDisbursedNum > 0
      ? [{ description: 'Total Expenses', unitAmount: formatAmount(totalDisbursedNum) }]
      : [];

  const checklist: any = rawReport.attachmentsChecklist || {};

  const data: PARTemplateData = {
    reportDate: formatDate(rawReport.submittedAt || rawReport.updatedAt || rawReport.createdAt),
    activityTitle: rawReport.eventTitle || proposalData?.title || '',
    description: rawReport.eventDescription || proposalData?.description || '',
    organizers: organizersList.filter(Boolean).join(', '),
    actualMechanics,
    materials: materialsList.filter(Boolean).join(', '),
    howManyAttended,
    whoAttended,
    marketing: marketingList.filter(Boolean).join(', '),
    documentation: docPlanList.filter(Boolean).join(', '),
    dateTime: rawReport.eventDateFormatted || proposalData?.proposedDate || '',
    venue: rawReport.eventVenue || proposalData?.venueName || proposalData?.venue || '',
    achievementOfObjectives: rawReport.results?.achievementNarrative || '',
    keyLearnings:
      Array.isArray(rawReport.results?.keyLearnings) && rawReport.results.keyLearnings.length > 0
        ? rawReport.results.keyLearnings.map((k) => `• ${k}`).join('\n')
        : '',
    classroomEnrichment: rawReport.results?.classroomEnrichment || '',
    reasonForVenueSelection: rawReport.results?.venueAssessment || '',
    foodLogisticsAssessment:
      rawReport.results?.foodAssessment || rawReport.results?.logisticsAssessment || '',
    scheduleCompliance: rawReport.results?.scheduleCompliance || '',
    issuesEncountered: rawReport.results?.issuesEncountered || 'No major issues encountered.',
    totalRevenue: formatAmount(totalRevenueNum),
    revenues,
    expenses,
    totalExpenses: formatAmount(totalDisbursedNum),
    netBalance: formatAmount(netBalanceNum),
    remarksContent: formatRemarksContent(rawReport),
    chkAttendanceSheet: checklist.attendanceSheet ? '☑' : '☐',
    chkPhotosOfActivity:
      checklist.photosOfActivity || (rawReport.photos && rawReport.photos.length > 0)
        ? '☑'
        : '☐',
    chkProgramInvitation: checklist.programInvitation ? '☑' : '☐',
    chkFeedbackEvaluation:
      checklist.feedbackEvaluationSummary || checklist.feedbackSummary ? '☑' : '☐',
    chkCopiesOfCertificates:
      checklist.copiesOfCertificatesLetters || checklist.certificatesLetters ? '☑' : '☐',
    preparedBy,
    notedBy,
  };

  return { data, imageDimensions };
}

export async function populatePostActivityReportDocx(
  report: PostActivityReportDocument,
  proposalData: any = null,
  liquidationData: any = null
): Promise<Blob> {
  const { data, imageDimensions } = await buildPARTemplatePayload(
    report,
    proposalData,
    liquidationData
  );
  return populateDocxTemplate(PAR_TEMPLATE_URL, data, imageDimensions);
}

export async function tryExportPostActivityReportDocxPdf(
  report: PostActivityReportDocument,
  proposalData: any,
  liquidationData: any,
  pdfFileName: string
): Promise<boolean> {
  const { data, imageDimensions } = await buildPARTemplatePayload(
    report,
    proposalData,
    liquidationData
  );
  return tryConvertPopulatedDocxToPdf(PAR_TEMPLATE_URL, data, imageDimensions, pdfFileName);
}
