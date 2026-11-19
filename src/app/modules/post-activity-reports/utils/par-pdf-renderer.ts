/**
 * src/app/modules/post-activity-reports/utils/par-pdf-renderer.ts
 *
 * Official Institutional Post-Activity Report (PAR) PDF Renderer.
 * Mirrors the exact paper structure of the STI Post-Activity Report:
 * - US Letter (215.9mm x 279.4mm), 25.4mm left/right margins
 * - STI College Ormoc logo on left + underlined "Date:" on right + centered "Post-Activity Report"
 * - Borderless 2-column layout with right-aligned sans-serif labels (Col 0) and serif content (Col 1)
 * - Italic helper prompts inside Col 1 above the entry/table, matching the paper template
 * - Nested underline-style Attendance block and bordered 3-column Financial Report table
 * - Exact Results of the Activity (7 subsections), Remarks, and VIII. Attachments checklist
 * - Clear aspect-preserved signature images for Prepared by and signed signatories (no extra timestamps/footers)
 */

import { jsPDF } from 'jspdf';
import type { PostActivityReportDocument, PARApprovalStep } from '../types/par.types';
import { resolvePARRemarksDescription } from './par-remarks.utils';
import { resolveSignatoryLabel } from '../../signatories/utils/signatory-label.utils';
import { STI_LOGO_BASE64 } from '../../activity-proposals/utils/sti-logo-asset';

interface LoadedImage {
  dataUrl: string;
  width: number;
  height: number;
  format: 'PNG' | 'JPEG';
}

function formatPdfAmount(amount: number | undefined | null): string {
  if (amount === undefined || amount === null || isNaN(amount)) return '0.00';
  const abs = Math.abs(amount);
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(abs);
  return amount < 0 ? `(${formatted})` : formatted;
}

function formatPdfDate(raw?: any): string {
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
    if (!isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
    }
  } catch {}
  return String(raw);
}

/**
 * Loads an external or data-URI image via fetch -> blob -> FileReader first
 * (avoids CORS tainted-canvas failures on Storage/Cloudinary), with an
 * HTMLImageElement + canvas fallback.
 */
async function defaultLoadImageAsDataUrl(url?: string): Promise<string | null> {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed || trimmed.includes('[base64-')) return null;
  if (/^data:image\//i.test(trimmed)) return trimmed.replace(/\s+/g, '');
  if (/^(iVBORw0KGgo|\/9j\/|R0lGOD|UklGR)/i.test(trimmed)) {
    const prefix = trimmed.startsWith('/9j/') ? 'data:image/jpeg;base64,' : 'data:image/png;base64,';
    return prefix + trimmed.replace(/\s+/g, '');
  }

  try {
    const res = await fetch(trimmed, { mode: 'cors' });
    if (res.ok) {
      const blob = await res.blob();
      const dataUrl = await new Promise<string | null>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
      if (dataUrl && dataUrl.startsWith('data:image/')) {
        return dataUrl;
      }
    }
  } catch {}

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width || 300;
        canvas.height = img.naturalHeight || img.height || 100;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = trimmed;
  });
}

async function resolveImageWithMetadata(
  url: string | undefined,
  loader: (url?: string) => Promise<string | null>
): Promise<LoadedImage | null> {
  const rawDataUrl = await loader(url);
  if (!rawDataUrl || !rawDataUrl.startsWith('data:image/')) return null;

  const isNativePng = rawDataUrl.startsWith('data:image/png');
  const isNativeJpeg =
    rawDataUrl.startsWith('data:image/jpeg') || rawDataUrl.startsWith('data:image/jpg');

  const loaded = await new Promise<{ dataUrl: string; w: number; h: number; format: 'PNG' | 'JPEG' }>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || img.width || 300;
      const h = img.naturalHeight || img.height || 100;
      // Convert WebP/SVG/GIF data URLs to PNG so jsPDF.addImage never fails
      if (!isNativePng && !isNativeJpeg) {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, w, h);
            resolve({ dataUrl: canvas.toDataURL('image/png'), w, h, format: 'PNG' });
            return;
          }
        } catch {}
      }
      resolve({
        dataUrl: rawDataUrl,
        w,
        h,
        format: isNativeJpeg ? 'JPEG' : 'PNG',
      });
    };
    img.onerror = () =>
      resolve({
        dataUrl: rawDataUrl,
        w: 300,
        h: 100,
        format: isNativeJpeg ? 'JPEG' : 'PNG',
      });
    img.src = rawDataUrl;
  });

  return {
    dataUrl: loaded.dataUrl,
    width: loaded.w,
    height: loaded.h,
    format: loaded.format,
  };
}

function fitDimensions(
  naturalW: number,
  naturalH: number,
  maxW: number,
  maxH: number
): { w: number; h: number } {
  if (!naturalW || !naturalH) return { w: maxW, h: maxH };
  const ratio = Math.min(maxW / naturalW, maxH / naturalH);
  return {
    w: Math.max(1, naturalW * ratio),
    h: Math.max(1, naturalH * ratio),
  };
}

function drawCheckbox(doc: jsPDF, x: number, y: number, checked: boolean) {
  const size = 2.8;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.25);
  doc.rect(x, y - size + 0.4, size, size);
  if (checked) {
    doc.setLineWidth(0.4);
    doc.line(x + 0.5, y - 0.9, x + 1.2, y - 0.15);
    doc.line(x + 1.2, y - 0.15, x + 2.4, y - 2.0);
    doc.setLineWidth(0.22);
  }
}

export async function buildPostActivityReportPDF(
  rawReport: PostActivityReportDocument,
  proposalData: any = null,
  liquidationData: any = null,
  imageLoader: (url?: string) => Promise<string | null> = defaultLoadImageAsDataUrl
): Promise<jsPDF> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'letter',
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 215.9mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 279.4mm
  const marginX = 25.4; // 1.0 inch margins
  const topMargin = 18;
  const bottomLimit = pageHeight - 18;

  const col0Width = 31.0;
  const col0RightEdge = marginX + col0Width - 2.0;
  const col1X = marginX + col0Width + 1.2;
  const col1Width = pageWidth - marginX - col1X; // ~132.9mm

  let cursorY = topMargin;

  const checkPageBreak = (neededHeight: number) => {
    if (cursorY + neededHeight > bottomLimit) {
      doc.addPage();
      cursorY = topMargin;
      return true;
    }
    return false;
  };

  const drawCol0Label = (label: string, y: number) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.2);
    doc.setTextColor(0, 0, 0);
    const lines: string[] = doc.splitTextToSize(label, col0Width - 1.5);
    let ly = y;
    lines.forEach((line) => {
      doc.text(line, col0RightEdge, ly, { align: 'right' });
      ly += 3.5;
    });
    return ly;
  };

  const drawCol1HelperNote = (note: string) => {
    doc.setFont('times', 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(0, 0, 0);
    const noteLines: string[] = doc.splitTextToSize(note, col1Width - 1);
    noteLines.forEach((nl) => {
      if (cursorY + 3.6 > bottomLimit) {
        doc.addPage();
        cursorY = topMargin;
      }
      doc.text(nl, col1X, cursorY);
      cursorY += 3.6;
    });
  };

  const drawCol1Divider = (spaceAfter = 4.2) => {
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.22);
    doc.line(col1X, cursorY, col1X + col1Width, cursorY);
    cursorY += spaceAfter;
  };

  const renderFieldRow = (
    label: string,
    bodyLines: string[],
    opts?: {
      helperNote?: string;
      drawRule?: boolean;
    }
  ) => {
    const cleanLines: string[] = [];
    doc.setFont('times', 'normal');
    doc.setFontSize(9.5);

    bodyLines.forEach((p) => {
      const text = (p || '').trim();
      if (!text) return;
      const split: string[] = doc.splitTextToSize(text, col1Width - 1.5);
      cleanLines.push(...split);
    });

    const approxH = (opts?.helperNote ? 4.5 : 0) + Math.max(1, cleanLines.length) * 3.8 + 4;
    checkPageBreak(Math.min(approxH, 24));

    const labelEndY = drawCol0Label(label, cursorY);

    if (opts?.helperNote) {
      drawCol1HelperNote(opts.helperNote);
      cursorY += 0.4;
    }

    doc.setFont('times', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(0, 0, 0);

    if (cleanLines.length === 0) {
      cursorY = Math.max(cursorY + 1.2, labelEndY - 2.0);
    } else {
      for (const line of cleanLines) {
        if (cursorY + 3.8 > bottomLimit) {
          doc.addPage();
          cursorY = topMargin;
          drawCol0Label(`${label} (cont.)`, cursorY);
          doc.setFont('times', 'normal');
          doc.setFontSize(9.5);
          doc.setTextColor(0, 0, 0);
        }
        doc.text(line, col1X, cursorY);
        cursorY += 3.8;
      }
      cursorY -= 2.4;
    }

    if (opts?.drawRule !== false) {
      drawCol1Divider(4.4);
    } else {
      cursorY += 3.0;
    }
  };

  // Preload STI Logo aspect ratio + maker & signatory signatures in parallel
  const preparedSigUrl = rawReport.preparedBy?.signatureUrl || rawReport.submittedBySignatureUrl || '';
  const chainSteps = Array.isArray(rawReport.approvalChain) ? rawReport.approvalChain : [];

  const [logoImg, preparedSigImg, ...stepSigImgs] = await Promise.all([
    resolveImageWithMetadata(STI_LOGO_BASE64, imageLoader),
    preparedSigUrl ? resolveImageWithMetadata(preparedSigUrl, imageLoader) : Promise.resolve(null),
    ...chainSteps.map((step) => {
      const isSigned =
        step.status === 'endorsed' ||
        step.status === 'approved' ||
        Boolean(step.signedAt);
      if (!isSigned || !step.signatureUrl) return Promise.resolve(null);
      return resolveImageWithMetadata(step.signatureUrl, imageLoader);
    }),
  ]);

  // ==========================================
  // DOCUMENT HEADER (Logo + Date + Title ONLY)
  // ==========================================
  if (logoImg) {
    const fittedLogo = fitDimensions(logoImg.width, logoImg.height, 36, 12.5);
    try {
      doc.addImage(logoImg.dataUrl, logoImg.format, marginX, cursorY - 2, fittedLogo.w, fittedLogo.h);
    } catch {}
  } else {
    try {
      doc.addImage(STI_LOGO_BASE64, 'PNG', marginX, cursorY - 2, 34, 11);
    } catch {}
  }

  // Date: on right side with underline beneath the date value
  const dateLabel = 'Date:';
  const reportDateText = formatPdfDate(rawReport.submittedAt || rawReport.updatedAt || rawReport.createdAt);
  const dateLineWidth = 38;
  const dateLineStartX = pageWidth - marginX - dateLineWidth;
  const dateLabelX = dateLineStartX - 2;
  const dateTextY = cursorY + 7;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(0, 0, 0);
  doc.text(dateLabel, dateLabelX, dateTextY, { align: 'right' });

  doc.setFont('times', 'normal');
  doc.setFontSize(9.5);
  doc.text(reportDateText, dateLineStartX + dateLineWidth / 2, dateTextY, { align: 'center' });
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.22);
  doc.line(dateLineStartX, dateTextY + 1.1, dateLineStartX + dateLineWidth, dateTextY + 1.1);

  cursorY += 13.5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(0, 0, 0);
  doc.text('Post-Activity Report', pageWidth / 2, cursorY, { align: 'center' });
  cursorY += 7.0;

  // ==========================================
  // CORE FORM FIELDS
  // ==========================================
  const activityTitle = rawReport.eventTitle || proposalData?.title || '';
  renderFieldRow('Activity title:', [activityTitle]);

  const descriptionText = rawReport.eventDescription || proposalData?.description || '';
  renderFieldRow('Description:', [descriptionText]);

  const organizersList =
    Array.isArray(rawReport.proposalOrganizers) && rawReport.proposalOrganizers.length > 0
      ? rawReport.proposalOrganizers
      : Array.isArray(proposalData?.organizers) && proposalData.organizers.length > 0
      ? proposalData.organizers
      : [rawReport.organizerName || rawReport.organizationName || ''];
  renderFieldRow('Organizer/s:', [organizersList.filter(Boolean).join(', ')]);

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

  const mechanicsBody = didMechanicsDiffer
    ? trimmedActualMechanics.split('\n').filter(Boolean)
    : ['Same as proposed.'];
  renderFieldRow('Mechanics:', mechanicsBody, {
    helperNote: '(Fill up only if actual mechanics differed from proposed. Attach a sheet, if necessary.)',
  });

  const materialsList =
    Array.isArray(rawReport.proposalMaterials) && rawReport.proposalMaterials.length > 0
      ? rawReport.proposalMaterials
      : Array.isArray(rawReport.materialsUtilized) && rawReport.materialsUtilized.length > 0
      ? rawReport.materialsUtilized
      : Array.isArray(proposalData?.materials) && proposalData.materials.length > 0
      ? proposalData.materials
      : [];
  renderFieldRow('Materials:', materialsList.length > 0 ? [materialsList.join(', ')] : []);

  // ==========================================
  // ATTENDANCE (Nested underline-only layout)
  // ==========================================
  checkPageBreak(22);
  drawCol0Label('Attendance:', cursorY);
  drawCol1HelperNote('(Attach attendance list, if available.)');
  cursorY += 2.2;

  const attLabelX = col1X + 4;
  const attValueX = col1X + 42;
  const attValueW = col1X + col1Width - attValueX;

  const howManyDisplay =
    rawReport.attendanceSummary?.howManyAttended ||
    (rawReport.attendanceSummary?.attendedCount
      ? `${rawReport.attendanceSummary.attendedCount} Attendees`
      : '');
  const whoAttendedDisplay =
    rawReport.attendanceSummary?.whoAttended ||
    rawReport.attendanceSummary?.targetAudience ||
    '';

  const drawAttendanceSubRow = (subLabel: string, value: string) => {
    doc.setFont('times', 'normal');
    doc.setFontSize(9.5);
    const valLines: string[] = value.trim()
      ? doc.splitTextToSize(value.trim(), attValueW - 2)
      : [''];
    checkPageBreak(valLines.length * 3.8 + 4);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.2);
    doc.setTextColor(0, 0, 0);
    doc.text(subLabel, attLabelX, cursorY);

    doc.setFont('times', 'normal');
    doc.setFontSize(9.5);
    valLines.forEach((vl, i) => {
      if (vl) doc.text(vl, attValueX, cursorY + i * 3.8);
    });
    const lineBottom = cursorY + Math.max(1, valLines.length) * 3.8 - 2.3;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.22);
    doc.line(attValueX, lineBottom, attValueX + attValueW, lineBottom);
    cursorY = lineBottom + 4.0;
  };

  drawAttendanceSubRow('How many attended?', howManyDisplay);
  drawAttendanceSubRow('Who attended?', whoAttendedDisplay);
  cursorY += 0.8;

  // ==========================================
  // MARKETING, DOCUMENTATION, DATE & TIME, VENUE
  // ==========================================
  const marketingList =
    Array.isArray(rawReport.proposalMarketingPlan) && rawReport.proposalMarketingPlan.length > 0
      ? rawReport.proposalMarketingPlan
      : Array.isArray(rawReport.marketingConducted) && rawReport.marketingConducted.length > 0
      ? rawReport.marketingConducted
      : Array.isArray(proposalData?.marketingPlan)
      ? proposalData.marketingPlan
      : [];
  renderFieldRow('Marketing:', marketingList.length > 0 ? [marketingList.join(', ')] : []);

  const docPlanList =
    Array.isArray(rawReport.proposalDocumentationPlan) && rawReport.proposalDocumentationPlan.length > 0
      ? rawReport.proposalDocumentationPlan
      : Array.isArray(proposalData?.documentationPlan)
      ? proposalData.documentationPlan
      : [];
  renderFieldRow('Documentation:', docPlanList.length > 0 ? [docPlanList.join(', ')] : []);

  renderFieldRow('Date & time:', [rawReport.eventDateFormatted || proposalData?.proposedDate || '']);
  renderFieldRow('Venue:', [rawReport.eventVenue || proposalData?.venueName || proposalData?.venue || '']);

  // ==========================================
  // RESULTS OF ACTIVITY (Exact 7 Subsections)
  // ==========================================
  checkPageBreak(22);
  drawCol0Label('Results of activity:', cursorY);
  drawCol1HelperNote('(Include assessment of success based on indicators. Attach a sheet, if necessary.)');
  cursorY += 3.5;

  doc.setFont('times', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(0, 0, 0);
  doc.text('Results of the Activity', col1X, cursorY);
  cursorY += 5.5;

  const resultSubsections: Array<{ num: string; title: string; body: string[] }> = [
    {
      num: '1.',
      title: 'Achievement of Objectives:',
      body: [rawReport.results?.achievementNarrative || ''],
    },
    {
      num: '2.',
      title: 'Key Learnings / Insights Gained:',
      body:
        Array.isArray(rawReport.results?.keyLearnings) && rawReport.results.keyLearnings.length > 0
          ? rawReport.results.keyLearnings.map((k) => `• ${k}`)
          : [],
    },
    {
      num: '3.',
      title: 'Enrichment of Learning Beyond the Classroom:',
      body: [rawReport.results?.classroomEnrichment || ''],
    },
    {
      num: '4.',
      title: 'Reason for Venue Selection:',
      body: [rawReport.results?.venueAssessment || ''],
    },
    {
      num: '5.',
      title: 'Food / Logistics Assessment:',
      body: [rawReport.results?.foodAssessment || rawReport.results?.logisticsAssessment || ''],
    },
    {
      num: '6.',
      title: 'Schedule Compliance:',
      body: [rawReport.results?.scheduleCompliance || ''],
    },
    {
      num: '7.',
      title: 'Issues / Problems Encountered and Actions Taken:',
      body: [rawReport.results?.issuesEncountered || 'No major issues encountered.'],
    },
  ];

  const subIndentX = col1X + 8.5;
  const subTextWidth = col1X + col1Width - subIndentX;

  for (const sub of resultSubsections) {
    checkPageBreak(10);
    doc.setFont('times', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(0, 0, 0);
    doc.text(sub.num, col1X + 3, cursorY);

    doc.setFont('times', 'bold');
    doc.setFontSize(9.5);
    doc.text(sub.title, subIndentX, cursorY);
    cursorY += 3.9;

    doc.setFont('times', 'normal');
    doc.setFontSize(9.5);
    const nonEmpty = sub.body.map((b) => b.trim()).filter(Boolean);
    for (const paragraph of nonEmpty) {
      const split: string[] = doc.splitTextToSize(paragraph, subTextWidth - 1);
      for (const line of split) {
        if (cursorY + 3.8 > bottomLimit) {
          doc.addPage();
          cursorY = topMargin;
        }
        doc.text(line, subIndentX, cursorY);
        cursorY += 3.8;
      }
    }
    cursorY += 1.4;
  }

  cursorY += 1.0;
  drawCol1Divider(4.6);

  // ==========================================
  // FINANCIAL REPORT (Bordered 3-col table)
  // ==========================================
  const totalRevenue = Number(
    rawReport.financialSummary?.totalRevenue ?? liquidationData?.totalBudget ?? liquidationData?.totalRevenue ?? 0
  );
  const totalDisbursed = Number(
    rawReport.financialSummary?.totalDisbursed ?? liquidationData?.totalActualSpending ?? 0
  );
  const netBalance = totalRevenue - totalDisbursed;
  const lineItems = Array.isArray(rawReport.financialSummary?.lineItems)
    ? rawReport.financialSummary.lineItems
    : [];

  checkPageBreak(36);
  drawCol0Label('Financial report:', cursorY);
  drawCol1HelperNote('(Attach supporting receipts and list of participants who have/haven’t paid.)');
  cursorY += 1.5;

  const finDescW = col1Width - 52;
  const finUnitW = 26;
  const finTotalW = 26;

  const drawFinHeader = (y: number) => {
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.22);
    doc.rect(col1X, y, finDescW, 5.8);
    doc.rect(col1X + finDescW, y, finUnitW, 5.8);
    doc.rect(col1X + finDescW + finUnitW, y, finTotalW, 5.8);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    doc.text('Description', col1X + 2, y + 4.0);
    doc.text('Unit Amount', col1X + finDescW + finUnitW - 2, y + 4.0, { align: 'right' });
    doc.text('Total Amount', col1X + col1Width - 2, y + 4.0, { align: 'right' });
    return y + 5.8;
  };

  let fy = drawFinHeader(cursorY);

  const drawFinRow = (
    desc: string,
    unitStr: string,
    totalStr: string,
    opts?: { bold?: boolean }
  ) => {
    doc.setFont('times', opts?.bold ? 'bold' : 'normal');
    doc.setFontSize(9);
    const descLines: string[] = doc.splitTextToSize(desc || '', finDescW - 4);
    const rh = Math.max(5.5, descLines.length * 3.6 + 1.9);

    if (fy + rh > bottomLimit) {
      doc.addPage();
      cursorY = topMargin;
      drawCol0Label('Financial report:', cursorY);
      fy = drawFinHeader(cursorY);
    }

    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.22);
    doc.rect(col1X, fy, finDescW, rh);
    doc.rect(col1X + finDescW, fy, finUnitW, rh);
    doc.rect(col1X + finDescW + finUnitW, fy, finTotalW, rh);

    doc.setFont('times', opts?.bold ? 'bold' : 'normal');
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    if (desc) doc.text(descLines, col1X + 2, fy + 3.8);
    if (unitStr) {
      doc.text(unitStr, col1X + finDescW + finUnitW - 2, fy + 3.8, { align: 'right' });
    }
    if (totalStr) {
      doc.text(totalStr, col1X + col1Width - 2, fy + 3.8, { align: 'right' });
    }
    fy += rh;
  };

  drawFinRow('Revenue:', '', formatPdfAmount(totalRevenue), { bold: true });
  drawFinRow('Expenses:', '', '', { bold: true });

  if (lineItems.length > 0) {
    lineItems.forEach((li) => {
      drawFinRow(
        li.description || 'Expense Item',
        li.unitAmount ? formatPdfAmount(li.unitAmount) : '',
        formatPdfAmount(li.totalAmount)
      );
    });
  } else {
    drawFinRow('Total Expenses', '', formatPdfAmount(totalDisbursed));
  }

  drawFinRow('TOTAL', '', formatPdfAmount(totalDisbursed), { bold: true });
  drawFinRow('Balance (Revenue less Expenses)', '', formatPdfAmount(netBalance), { bold: true });

  cursorY = fy + 5.0;

  // ==========================================
  // REMARKS + VIII. ATTACHMENTS (IF APPLICABLE)
  // ==========================================
  checkPageBreak(26);
  drawCol0Label('Remarks:', cursorY);
  drawCol1HelperNote('(For future activity improvements.)');
  cursorY += 0.8;

  const remarksIntro =
    'This section highlights observations and recommendations that may help enhance the planning, coordination, and overall implementation of similar activities in the future. These remarks are based on actual experiences during the event, feedback from participants, and identified areas that can still be improved. The goal is to ensure better efficiency, higher participant satisfaction, and smoother execution in succeeding activities.';
  doc.setFont('times', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(0, 0, 0);
  const introLines: string[] = doc.splitTextToSize(remarksIntro, col1Width - 1);
  for (const il of introLines) {
    if (cursorY + 3.8 > bottomLimit) {
      doc.addPage();
      cursorY = topMargin;
    }
    doc.text(il, col1X, cursorY);
    cursorY += 3.8;
  }
  cursorY += 2.2;

  const singleRemarks = resolvePARRemarksDescription(rawReport);
  if (singleRemarks) {
    const paragraphs = singleRemarks.split(/\r?\n/);
    doc.setFont('times', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(0, 0, 0);
    for (const para of paragraphs) {
      if (!para.trim()) {
        cursorY += 2.2;
        continue;
      }
      const wrappedLines: string[] = doc.splitTextToSize(para, col1Width - 1);
      for (const wl of wrappedLines) {
        if (cursorY + 3.8 > bottomLimit) {
          doc.addPage();
          cursorY = topMargin;
        }
        doc.text(wl, col1X, cursorY);
        cursorY += 3.8;
      }
    }
    cursorY += 1.5;
  } else {
    cursorY += 1.5;
  }

  // VIII. Attachments (if applicable) — centered plain list matching PAR_updated1.docx
  checkPageBreak(26);
  cursorY += 1.5;
  drawCol0Label('VIII. Attachments (if applicable)', cursorY);

  const attachmentLabels = [
    'Attendance Sheet',
    'Photos of Activity',
    'Program / Invitation',
    'Feedback / Evaluation Summary',
    'Copies of Certificates, Letters, etc',
  ];

  doc.setFont('times', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(0, 0, 0);
  const col1CenterX = col1X + col1Width / 2;
  attachmentLabels.forEach((label) => {
    doc.text(label, col1CenterX, cursorY, { align: 'center' });
    cursorY += 4.2;
  });

  cursorY += 2.5;

  // ==========================================
  // SIGNATORIES (Full-width Col 1 borders matching PAR_updated1.docx)
  // ==========================================
  const renderCol1SignatureSlot = (
    x: number,
    y: number,
    slotWidth: number,
    opts: {
      name: string;
      roleTitle?: string;
      sigImg: LoadedImage | null;
      isSigned: boolean;
    }
  ): number => {
    const sigBoxH = 11.0;
    if (opts.isSigned && opts.sigImg) {
      const fitted = fitDimensions(
        opts.sigImg.width,
        opts.sigImg.height,
        Math.min(34, slotWidth - 4),
        sigBoxH - 1
      );
      const sigX = x + Math.max(0, (slotWidth - fitted.w) / 2);
      const sigY = y + Math.max(0, sigBoxH - fitted.h - 0.5);
      try {
        doc.addImage(opts.sigImg.dataUrl, opts.sigImg.format, sigX, sigY, fitted.w, fitted.h);
      } catch {}
    }

    let textY = y + sigBoxH + 1.5;
    if (opts.name) {
      doc.setFont('times', 'bold');
      doc.setFontSize(9.2);
      doc.setTextColor(0, 0, 0);
      const nameLines: string[] = doc.splitTextToSize(opts.name, slotWidth);
      nameLines.forEach((nl) => {
        doc.text(nl, x + slotWidth / 2, textY, { align: 'center' });
        textY += 3.5;
      });
    }

    if (opts.roleTitle) {
      doc.setFont('times', 'normal');
      doc.setFontSize(8.2);
      doc.setTextColor(51, 65, 85);
      const roleLines: string[] = doc.splitTextToSize(opts.roleTitle, slotWidth);
      roleLines.forEach((rl) => {
        doc.text(rl, x + slotWidth / 2, textY, { align: 'center' });
        textY += 3.2;
      });
    }

    return Math.max(y + sigBoxH + 1.0, textY - 0.8);
  };

  // Top horizontal border starting the Prepared by / Noted by table rows
  checkPageBreak(26);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.22);
  doc.line(col1X, cursorY, col1X + col1Width, cursorY);
  cursorY += 1.0;

  // Prepared by:
  const makerName = rawReport.preparedBy?.name || rawReport.submittedByName || rawReport.createdByName || '';
  const makerRole = rawReport.preparedBy?.roleTitle || rawReport.submittedByRole || '';
  const makerSigned = Boolean(preparedSigImg || rawReport.preparedBy?.signedAt || rawReport.submittedAt);

  const preparedEndY = renderCol1SignatureSlot(col1X, cursorY, Math.min(68, col1Width), {
    name: makerName,
    roleTitle: makerRole,
    sigImg: preparedSigImg,
    isSigned: makerSigned,
  });
  drawCol0Label('Prepared by:', preparedEndY - 1.2);
  cursorY = preparedEndY + 1.2;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.22);
  doc.line(col1X, cursorY, col1X + col1Width, cursorY);
  cursorY += 1.0;

  // Noted by: / Endorsed by: Signatories with full-width Col 1 divider lines
  if (chainSteps.length > 0) {
    const groups: Array<{ label: string; items: Array<{ step: PARApprovalStep; img: LoadedImage | null }> }> = [];
    chainSteps.forEach((step, idx) => {
      const label = resolveSignatoryLabel(step) || 'Noted by:';
      const lastGroup = groups[groups.length - 1];
      const entry = { step, img: stepSigImgs[idx] || null };
      if (lastGroup && lastGroup.label === label) {
        lastGroup.items.push(entry);
      } else {
        groups.push({ label, items: [entry] });
      }
    });

    for (const group of groups) {
      for (let i = 0; i < group.items.length; i += 2) {
        checkPageBreak(24);

        const slotW = group.items.length === 1 && i === 0 ? Math.min(68, col1Width) : (col1Width - 8) / 2;
        const first = group.items[i];
        const firstSigned =
          first.step.status === 'endorsed' ||
          first.step.status === 'approved' ||
          Boolean(first.step.signedAt);

        const endA = renderCol1SignatureSlot(col1X, cursorY, slotW, {
          name: first.step.signatoryName,
          roleTitle: first.step.roleTitle || '',
          sigImg: first.img,
          isSigned: firstSigned,
        });

        let endB = endA;
        if (i + 1 < group.items.length) {
          const second = group.items[i + 1];
          const secondSigned =
            second.step.status === 'endorsed' ||
            second.step.status === 'approved' ||
            Boolean(second.step.signedAt);
          endB = renderCol1SignatureSlot(col1X + slotW + 8, cursorY, slotW, {
            name: second.step.signatoryName,
            roleTitle: second.step.roleTitle || '',
            sigImg: second.img,
            isSigned: secondSigned,
          });
        }

        const rowEndY = Math.max(endA, endB);
        if (i === 0) {
          drawCol0Label(group.label, rowEndY - 1.2);
        }
        cursorY = rowEndY + 1.2;
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.22);
        doc.line(col1X, cursorY, col1X + col1Width, cursorY);
        cursorY += 1.0;
      }
    }
  } else {
    checkPageBreak(22);
    const notedEndY = renderCol1SignatureSlot(col1X, cursorY, Math.min(68, col1Width), {
      name: '',
      sigImg: null,
      isSigned: false,
    });
    drawCol0Label('Noted by:', notedEndY - 1.2);
    cursorY = notedEndY + 1.2;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.22);
    doc.line(col1X, cursorY, col1X + col1Width, cursorY);
    cursorY += 1.0;
  }

  // Official 15-school-day Note directly below signatories (0.5in first-line indent matching PAR_updated1.docx)
  checkPageBreak(12);
  cursorY += 4.0;
  const noteIndentX = marginX + 12.7; // 0.5 inch first-line indent (w:firstLine="720")
  const maxRightX = pageWidth - marginX;
  const noteBodyText = ' This report must be submitted to the Administrator within 15 school days from the date of activity completion.';

  doc.setFont('helvetica', 'bolditalic');
  doc.setFontSize(8.0);
  doc.setTextColor(0, 0, 0);
  doc.text('Note:', noteIndentX, cursorY);
  const noteLabelW = doc.getTextWidth('Note:');

  doc.setFont('helvetica', 'italic');
  const firstLineMaxW = maxRightX - (noteIndentX + noteLabelW);
  const words = noteBodyText.trim().split(' ');
  let line1 = '';
  let idx = 0;
  while (idx < words.length) {
    const candidate = line1 ? `${line1} ${words[idx]}` : ` ${words[idx]}`;
    if (doc.getTextWidth(candidate) <= firstLineMaxW) {
      line1 = candidate;
      idx++;
    } else {
      break;
    }
  }
  doc.text(line1, noteIndentX + noteLabelW, cursorY);
  if (idx < words.length) {
    cursorY += 3.6;
    const remainingText = words.slice(idx).join(' ');
    const remLines: string[] = doc.splitTextToSize(remainingText, maxRightX - marginX);
    remLines.forEach((rl) => {
      doc.text(rl, marginX, cursorY);
      cursorY += 3.6;
    });
  }

  // ==========================================
  // APPENDED PHOTO DOCUMENTATION SHEETS (if any)
  // ==========================================
  const reportPhotos = Array.isArray(rawReport.photos) ? rawReport.photos : [];
  if (reportPhotos.length > 0) {
    const loadedPhotos = await Promise.all(
      reportPhotos.map(async (p) => ({
        caption: p.caption || '',
        img: await resolveImageWithMetadata(p.url || (p as any).dataUrl, imageLoader),
      }))
    );
    const validPhotos = loadedPhotos.filter((p) => p.img !== null);

    if (validPhotos.length > 0) {
      doc.addPage();
      cursorY = topMargin;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(0, 0, 0);
      doc.text('Photos of Activity', marginX, cursorY);
      cursorY += 5.5;

      const slotW = (pageWidth - 2 * marginX - 6) / 2;
      const slotH = 58;

      for (let i = 0; i < validPhotos.length; i += 2) {
        if (cursorY + slotH + 10 > pageHeight - 16) {
          doc.addPage();
          cursorY = topMargin;
        }

        const pair = [validPhotos[i], validPhotos[i + 1]].filter(Boolean);
        pair.forEach((entry, idx) => {
          const px = marginX + idx * (slotW + 6);
          const photo = entry.img!;
          doc.setDrawColor(148, 163, 184);
          doc.setLineWidth(0.22);
          doc.rect(px, cursorY, slotW, slotH);

          const fitted = fitDimensions(photo.width, photo.height, slotW - 3, slotH - 10);
          const ix = px + (slotW - fitted.w) / 2;
          const iy = cursorY + (slotH - 8 - fitted.h) / 2 + 1;
          try {
            doc.addImage(photo.dataUrl, photo.format, ix, iy, fitted.w, fitted.h);
          } catch {}

          if (entry.caption) {
            doc.setFont('times', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(0, 0, 0);
            const capLines: string[] = doc.splitTextToSize(entry.caption, slotW - 4).slice(0, 2);
            doc.text(capLines, px + slotW / 2, cursorY + slotH - 5, { align: 'center' });
          }
        });

        cursorY += slotH + 6;
      }
    }
  }

  return doc;
}
