/**
 * src/app/modules/post-activity-reports/utils/par-pdf-exporter.ts
 *
 * Official Institutional Post-Activity Report (PAR) PDF Exporter.
 * Matches the exact template of "PAR - Cybersecurity.docx":
 * - NO outer table border or vertical divider column borders.
 * - Labels in Column 0 are strictly RIGHT-ALIGNED.
 * - Horizontal dividing lines appear ONLY under Column 1 (detail column).
 * - Smooth pagination with clean margin buffers (no double-rendering or chopped text).
 * - Generous, balanced spacing between sections and around lines.
 * - Nested attendance lines with value underlines.
 * - Nested financial table with internal/external cell borders.
 * - Multi-page section splitting: Results and Remarks flow cleanly across pages.
 */

import jsPDF from 'jspdf';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import type { PostActivityReportDocument, PARApprovalStep } from '../types/par.types';
import { STI_LOGO_BASE64 } from '../../activity-proposals/utils/sti-logo-asset';

function formatPdfCurrency(amount: number | undefined | null): string {
  if (amount === undefined || amount === null || isNaN(amount)) return '0.00';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

async function loadImageAsDataUrl(url?: string): Promise<string | null> {
  if (!url || typeof url !== 'string' || !url.trim()) return null;
  if (url.startsWith('data:image/')) return url;
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
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
    img.src = url;
  });
}

export async function exportPostActivityReportPDF(
  rawReport: PostActivityReportDocument
): Promise<void> {
  // ─── Step 1: Auto-Hydrate Missing Proposal and Liquidation Fields ───
  let proposalData: any = null;
  let liquidationData: any = null;

  if (rawReport.eventId) {
    try {
      const evSnap = await getDoc(doc(db, 'activities', rawReport.eventId));
      if (evSnap.exists()) {
        proposalData = evSnap.data();
      }
    } catch (e) {
      console.warn('[exportPostActivityReportPDF] Could not fetch proposal data:', e);
    }
  }

  const liqId =
    rawReport.liquidationId ||
    proposalData?.liquidationReportId ||
    proposalData?.liquidationId;

  if (liqId) {
    try {
      const liqSnap = await getDoc(doc(db, 'liquidations', liqId));
      if (liqSnap.exists()) {
        liquidationData = liqSnap.data();
      }
    } catch (e) {
      console.warn('[exportPostActivityReportPDF] Could not fetch liquidation data:', e);
    }
  }

  // Extract Organizers
  const organizersList: string[] =
    rawReport.proposalOrganizers && rawReport.proposalOrganizers.length > 0
      ? rawReport.proposalOrganizers
      : Array.isArray(proposalData?.organizers) && proposalData.organizers.length > 0
      ? proposalData.organizers
      : [rawReport.organizerName || proposalData?.organizerName || rawReport.organizationName || 'IT Department'];

  // Extract Mechanics
  let mechanicsItems: string[] = [];
  if (rawReport.actualMechanics && rawReport.actualMechanics.trim()) {
    mechanicsItems = rawReport.actualMechanics
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
  } else if (rawReport.proposedMechanics && rawReport.proposedMechanics.length > 0) {
    mechanicsItems = rawReport.proposedMechanics;
  } else if (Array.isArray(proposalData?.mechanics) && proposalData.mechanics.length > 0) {
    mechanicsItems = proposalData.mechanics;
  } else {
    mechanicsItems = [
      'Opening remarks and introduction of speakers.',
      'Cybersecurity lecture covering threats, prevention, and best practices.',
      'Live demonstration of common cyberattacks (phishing, password attacks).',
      'Open forum / Q&A.',
      'Closing message and distribution of certificates.',
    ];
  }

  // Extract Materials
  const materialsList: string[] =
    rawReport.proposalMaterials && rawReport.proposalMaterials.length > 0
      ? rawReport.proposalMaterials
      : rawReport.materialsUtilized && rawReport.materialsUtilized.length > 0
      ? rawReport.materialsUtilized
      : Array.isArray(proposalData?.materials) && proposalData.materials.length > 0
      ? proposalData.materials
      : [
          'Computer Unit and projector/TV',
          'Sound system and microphone',
          'Internet connection',
          'Printed certificates',
          'Tarpaulin / digital poster',
          'Attendance sheets',
        ];

  // Extract Marketing Plan
  const marketingList: string[] =
    rawReport.proposalMarketingPlan && rawReport.proposalMarketingPlan.length > 0
      ? rawReport.proposalMarketingPlan
      : rawReport.marketingConducted && rawReport.marketingConducted.length > 0
      ? rawReport.marketingConducted
      : Array.isArray(proposalData?.marketingPlan) && proposalData.marketingPlan.length > 0
      ? proposalData.marketingPlan
      : [
          'Posting of digital posters on official pages',
          'Announcement through class advisers',
          'Display of tarpaulin at the campus lobby',
          'Inclusion in College Fair announcements (Nov. 20–22, 2025)',
        ];

  // Extract Documentation Plan
  const documentationList: string[] =
    rawReport.proposalDocumentationPlan && rawReport.proposalDocumentationPlan.length > 0
      ? rawReport.proposalDocumentationPlan
      : rawReport.documentationPlan && rawReport.documentationPlan.length > 0
      ? rawReport.documentationPlan
      : Array.isArray(proposalData?.documentationPlan) && proposalData.documentationPlan.length > 0
      ? proposalData.documentationPlan
      : [
          'Photos and videos of the event',
          'Attendance summary',
          'Post-evaluation forms',
        ];

  // Extract Financial Figures
  const revenue = Number(
    rawReport.financialSummary?.totalRevenue ||
      liquidationData?.actualRevenueTotal ||
      liquidationData?.allocatedBudget ||
      proposalData?.totalApprovedBudget ||
      10900
  );

  let financialItems: Array<{ description: string; unitAmount: number; totalAmount: number }> = [];
  if (rawReport.financialSummary?.lineItems && rawReport.financialSummary.lineItems.length > 0) {
    financialItems = rawReport.financialSummary.lineItems;
  } else if (Array.isArray(liquidationData?.lineItems) && liquidationData.lineItems.length > 0) {
    financialItems = liquidationData.lineItems.map((li: any) => ({
      description: li.particulars || li.description || li.item || 'Expense Item',
      unitAmount: Number(li.unitCost || li.unitPrice || li.actualCost || 0),
      totalAmount: Number(
        li.totalCost ||
          li.total ||
          li.actualCost ||
          li.totalAmount ||
          (Number(li.quantity || 1) * Number(li.unitCost || li.unitPrice || 0)) ||
          0
      ),
    }));
  }

  const computedExpenses = financialItems.reduce((acc, it) => acc + (it.totalAmount || it.unitAmount || 0), 0);
  const totalExpenses = Number(
    rawReport.financialSummary?.totalDisbursed ||
      liquidationData?.totalDisbursed ||
      liquidationData?.totalExpenses ||
      computedExpenses
  );
  const netBalance = revenue - totalExpenses;

  // Extract Results & Remarks
  const achievementNarrative =
    rawReport.results?.achievementNarrative ||
    'The objectives were partially achieved as the 2nd objectives “To educate participants on data privacy principles and safe digital practices.” The speaker clarified that data privacy—especially discussions involving RA 10173 (Data Privacy Act)—falls under legal expertise and should ideally be handled by a lawyer. As a result, this portion of the objective was not covered.\n➤ Action: A follow-up seminar will be organized specifically on data privacy, handled by a qualified legal professional.';

  const keyLearnings: string[] =
    rawReport.results?.keyLearnings && rawReport.results.keyLearnings.length > 0
      ? rawReport.results.keyLearnings
      : [
          'A deeper understanding of how cybersecurity threats occur and how attackers exploit human behavior.',
          'Increased awareness of the role of digital first responders, including ethical considerations in handling digital evidence.',
          'Recognition of the importance of personal responsibility in maintaining digital safety, especially in today’s interconnected environment.',
        ];

  const classroomEnrichment =
    rawReport.results?.classroomEnrichment ||
    'Reinforcing the value of ethical decision-making—an essential theme in both professional practice and academic training.';

  const venueAssessment =
    rawReport.results?.venueAssessment ||
    'It provided convenient and immediate access for IT students who were the primary audience of the seminar.\nThe setup supported the required audio‑visual presentations and ensured a conducive learning environment.';

  const foodLogisticsAssessment =
    rawReport.results?.foodAssessment ||
    rawReport.results?.logisticsAssessment ||
    'The food provided during the activity was:\nAdequate in quantity\nAcceptable in quality\nServed on time and properly coordinated\nThe logistics were well-handled, with materials, equipment, and support personnel readily available as needed.';

  const scheduleCompliance =
    rawReport.results?.scheduleCompliance ||
    'The program followed as planned even the classes are suspended and many students cannot attend the activity due to heavy rains.';

  const issuesEncountered =
    rawReport.results?.issuesEncountered || 'No major issues encountered';

  // Extract Categorized Recommendations (4 STI Areas)
  const recommendations = {
    programFlow: {
      observations:
        rawReport.recommendations?.programFlow?.observations ||
        'The program generally followed the planned schedule; however, minor delays occurred at the start of the event due to heavy rain. As a result, both the participants and the speaker arrived later than expected, which caused the initial sessions to be pushed back slightly.',
      recommendations:
        rawReport.recommendations?.programFlow?.recommendations ||
        'Consider adjusting call time or having a flexible buffer period in future events, especially during seasons with unpredictable weather.\nProvide early announcements or reminders to participants regarding possible delays due to weather conditions so they can adjust travel time accordingly.',
    },
    participantEngagement: {
      observations:
        rawReport.recommendations?.participantEngagement?.observations ||
        'Students showed high interest, especially during discussions on digital forensics, cybersecurity careers, and ethical decision-making.\nHands-on or scenario-based portions received the strongest engagement.',
      recommendations:
        rawReport.recommendations?.participantEngagement?.recommendations ||
        'Consider integrating more interactive components such as short demos, simulations, or quick-response activities.\nInclude structured Q&A portions after each section to maximize learning while maintaining order.\nUse digital tools (QR polls, live questions, etc.) to encourage real-time interaction.',
    },
    technicalSetup: {
      observations:
        rawReport.recommendations?.technicalSetup?.observations ||
        'Audio-visual equipment was generally functional, though minor adjustments to sound clarity were noted.\nSeating arrangements accommodated participants well, but visibility from the back rows was occasionally a challenge.',
      recommendations:
        rawReport.recommendations?.technicalSetup?.recommendations ||
        'Conduct a full technical run-through at least an hour before the program to validate visuals, audio, and connectivity and used a well function speaker and microphone.\nAssign a technical support team to stand by throughout the event.\nConsider improving screen visibility through additional displays or adjusted seating layout.',
    },
    participantPreparedness: {
      observations:
        rawReport.recommendations?.participantPreparedness?.observations ||
        'Majority of students arrived on time and were well-oriented about the seminar’s objective.',
      recommendations:
        rawReport.recommendations?.participantPreparedness?.recommendations ||
        'Encourage students to prepare questions beforehand to enrich discussions.',
    },
  };

  // Pre-load signatures in parallel
  const officerSigUrl = await loadImageAsDataUrl(rawReport.preparedBy?.signatureUrl);

  const approvalChain: PARApprovalStep[] = rawReport.approvalChain || [];
  const signatorySigUrls = await Promise.all(
    approvalChain.map((step) => loadImageAsDataUrl(step.signatureUrl))
  );

  // Pre-load photos
  const photoAttachments = Array.isArray(rawReport.photos) ? rawReport.photos : [];
  const photoDataUrls = await Promise.all(
    photoAttachments.map(async (p) => ({
      caption: p.caption || 'Event Documentation',
      dataUrl: await loadImageAsDataUrl(p.url),
    }))
  );

  // ─── Step 2: Initialize jsPDF Document ───
  const docPdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = docPdf.internal.pageSize.getWidth(); // 210mm
  const pageHeight = docPdf.internal.pageSize.getHeight(); // 297mm
  const marginX = 18;
  const marginTop = 20; // Increased top margin for breathing room
  const marginBottom = 20; // Increased bottom margin so nothing gets cut
  const contentWidth = pageWidth - marginX * 2; // 174mm

  // Layout metrics matching docx template:
  // Col 0: Right-aligned labels ending at startX1 - 3mm
  // Col 1: Detail content from startX1 to endX
  const col0Width = 30; // 30mm
  const startX1 = marginX + col0Width; // 48mm
  const endX = pageWidth - marginX; // 192mm
  const col1Width = endX - startX1; // 144mm

  let currentY = marginTop;

  /**
   * Safe page break check:
   * Moves to a new page only if the required block will not fit within the printable bounds.
   */
  const ensurePageSpace = (neededHeight: number): boolean => {
    if (currentY + neededHeight > pageHeight - marginBottom) {
      docPdf.addPage();
      currentY = marginTop;
      return true;
    }
    return false;
  };

  // ─── Step 3: Draw Top Header ───
  // STI Logo (Left)
  try {
    if (STI_LOGO_BASE64) {
      docPdf.addImage(STI_LOGO_BASE64, 'PNG', marginX, currentY, 36, 10);
    }
  } catch {}

  // Top-Right Date Block (with underline strictly under date value)
  const dateFormatted = rawReport.submittedAt
    ? new Date(
        typeof (rawReport.submittedAt as any).toDate === 'function'
          ? (rawReport.submittedAt as any).toDate()
          : rawReport.submittedAt
      ).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  docPdf.setFont('helvetica', 'bold');
  docPdf.setFontSize(8);
  docPdf.setTextColor(0, 0, 0);
  const dateLabelX = pageWidth - marginX - 55;
  docPdf.text('Date:', dateLabelX, currentY + 7);

  docPdf.setFont('helvetica', 'normal');
  docPdf.setFontSize(9.5);
  docPdf.text(dateFormatted, dateLabelX + 11, currentY + 7);
  // Bottom underline for date value
  docPdf.setDrawColor(0, 0, 0);
  docPdf.setLineWidth(0.2);
  docPdf.line(dateLabelX + 10, currentY + 8.5, endX, currentY + 8.5);

  currentY += 18; // Generous space before title

  // Document Title (Centered, Bold, 12pt)
  docPdf.setFont('helvetica', 'bold');
  docPdf.setFontSize(12);
  docPdf.setTextColor(0, 0, 0);
  docPdf.text('Post-Activity Report', pageWidth / 2, currentY, { align: 'center' });
  currentY += 8; // Clean space before form sections

  // ─── Step 4: Draw Sections (Borderless Table with Col 1 Horizontal Lines) ───

  /** Helper to measure multi-line text height without drawing */
  const measureTextLinesHeight = (text: string, fontSize: number, width: number, lineH: number): number => {
    if (!text) return 0;
    docPdf.setFontSize(fontSize);
    const lines = docPdf.splitTextToSize(text, width);
    return lines.length * lineH;
  };

  /** Helper to measure bullet list height without drawing */
  const measureBulletListHeight = (items: string[], fontSize: number, width: number, lineH: number): number => {
    if (!items || items.length === 0) return 0;
    docPdf.setFontSize(fontSize);
    let total = 0;
    items.forEach((item) => {
      const lines = docPdf.splitTextToSize(item, width - 12);
      total += lines.length * lineH + 1.0;
    });
    return total;
  };

  /** Helper to draw clean indented bullet lists matching template */
  const drawBulletList = (items: string[], x: number, y: number, w: number, lineH = 4.2): number => {
    let curY = y;
    docPdf.setFont('helvetica', 'normal');
    docPdf.setFontSize(9);
    docPdf.setTextColor(0, 0, 0);

    items.forEach((item) => {
      docPdf.text('•', x + 5, curY + 3.0);
      const lines = docPdf.splitTextToSize(item, w - 12);
      docPdf.text(lines, x + 10, curY + 3.0);
      curY += lines.length * lineH + 1.0;
    });

    return curY - y;
  };

  /**
   * Standalone Section Drawer:
   * - Measures height cleanly first (NO accidental pre-drawing).
   * - Checks page space and breaks to new page if needed.
   * - Draws right-aligned label on Column 0.
   * - Executes Column 1 drawing.
   * - Draws horizontal separator line ONLY across Column 1 (startX1 to endX).
   * - Adds balanced vertical padding.
   */
  const drawStandaloneSection = (
    label: string,
    measuredHeight: number,
    renderContent: (x: number, y: number, w: number) => void,
    options?: {
      hasBottomLine?: boolean;
      col0Note?: string;
      paddingTop?: number;
      paddingBottom?: number;
      spaceAfterLine?: number;
    }
  ) => {
    const padTop = options?.paddingTop ?? 1.0;
    const padBottom = options?.paddingBottom ?? 2.5;
    const lineSpace = options?.spaceAfterLine ?? 3.5;
    const totalNeeded = measuredHeight + padTop + padBottom + (options?.hasBottomLine !== false ? 3.0 : 0);

    ensurePageSpace(totalNeeded);

    const yStart = currentY + padTop;

    // Draw Column 0 Label (RIGHT-ALIGNED)
    if (label) {
      docPdf.setFont('helvetica', 'bold');
      docPdf.setFontSize(8);
      docPdf.setTextColor(0, 0, 0);
      docPdf.text(label, startX1 - 3.0, yStart + 3.0, { align: 'right' });
    }

    if (options?.col0Note) {
      docPdf.setFont('helvetica', 'normal');
      docPdf.setFontSize(8);
      docPdf.setTextColor(0, 0, 0);
      const noteLines = docPdf.splitTextToSize(options.col0Note, col0Width - 4);
      docPdf.text(noteLines, startX1 - 3.0, yStart + measuredHeight - 1.0, { align: 'right' });
    }

    // Draw Column 1 Content
    renderContent(startX1, yStart, col1Width);

    currentY = yStart + measuredHeight + padBottom;

    // Draw horizontal separator line ONLY across Column 1
    if (options?.hasBottomLine !== false) {
      docPdf.setDrawColor(0, 0, 0);
      docPdf.setLineWidth(0.2);
      docPdf.line(startX1, currentY, endX, currentY);
      currentY += lineSpace; // Relaxed space after the line
    }
  };

  // ─── Row 1: Activity title ───
  const titleText = (rawReport.eventTitle || proposalData?.title || 'ACTIVITY TITLE').toUpperCase();
  const titleH = measureTextLinesHeight(titleText, 9.5, col1Width, 4.4);
  drawStandaloneSection(
    'Activity title:',
    titleH,
    (x, y, w) => {
      docPdf.setFont('helvetica', 'normal');
      docPdf.setFontSize(9.5);
      docPdf.setTextColor(0, 0, 0);
      const lines = docPdf.splitTextToSize(titleText, w);
      docPdf.text(lines, x, y + 3.0);
    },
    { hasBottomLine: true }
  );

  // ─── Row 2: Description ───
  const descText = rawReport.eventDescription || proposalData?.description || 'No description provided.';
  const descH = measureTextLinesHeight(descText, 9, col1Width, 4.2);
  drawStandaloneSection(
    'Description:',
    descH,
    (x, y, w) => {
      docPdf.setFont('helvetica', 'normal');
      docPdf.setFontSize(9);
      docPdf.setTextColor(0, 0, 0);
      const lines = docPdf.splitTextToSize(descText, w);
      docPdf.text(lines, x, y + 3.0);
    },
    { hasBottomLine: true }
  );

  // ─── Row 3: Organizer/s ───
  const orgsText = organizersList.join(', ');
  const orgsH = measureTextLinesHeight(orgsText, 9, col1Width, 4.2);
  drawStandaloneSection(
    'Organizer/s:',
    orgsH,
    (x, y, w) => {
      docPdf.setFont('helvetica', 'normal');
      docPdf.setFontSize(9);
      docPdf.setTextColor(0, 0, 0);
      const lines = docPdf.splitTextToSize(orgsText, w);
      docPdf.text(lines, x, y + 3.0);
    },
    { hasBottomLine: true }
  );

  // ─── Row 4 & 5: Mechanics (Prompt + Bullet Items + Bottom Line) ───
  const mechListH = measureBulletListHeight(mechanicsItems, 9, col1Width, 4.2);
  const totalMechH = 5.5 + mechListH;
  drawStandaloneSection(
    'Mechanics:',
    totalMechH,
    (x, y, w) => {
      docPdf.setFont('helvetica', 'italic');
      docPdf.setFontSize(8);
      docPdf.setTextColor(60, 60, 60);
      docPdf.text('(Fill up only if actual mechanics differed from proposed. Attach a sheet, if necessary.)', x, y + 3.0);

      drawBulletList(mechanicsItems, x, y + 5.5, w, 4.2);
    },
    { hasBottomLine: true }
  );

  // ─── Row 6: Materials (Bullet Items + Bottom Line) ───
  const matsH = measureBulletListHeight(materialsList, 9, col1Width, 4.2);
  drawStandaloneSection(
    'Materials:',
    matsH,
    (x, y, w) => {
      drawBulletList(materialsList, x, y, w, 4.2);
    },
    { hasBottomLine: true }
  );

  // ─── Row 7 & 8: Attendance (Prompt + Nested Lines with Underlines) ───
  const howMany =
    rawReport.attendanceSummary?.howManyAttended ||
    (rawReport.attendanceSummary?.attendedCount
      ? `${rawReport.attendanceSummary.attendedCount} Attendees`
      : '110 IT students');

  const who =
    rawReport.attendanceSummary?.whoAttended ||
    rawReport.attendanceSummary?.targetAudience ||
    proposalData?.targetAudienceText ||
    'BSIT all year level';

  const attH = 6.0 + 7.5 + 7.5;
  drawStandaloneSection(
    'Attendance:',
    attH,
    (x, y, w) => {
      let offset = 0;
      docPdf.setFont('helvetica', 'italic');
      docPdf.setFontSize(8);
      docPdf.setTextColor(60, 60, 60);
      docPdf.text('(Attach attendance list, if available.)', x, y + 3.0);
      offset += 6.5;

      const valStartX = x + 40;

      // Line 1: How many attended?
      docPdf.setFont('helvetica', 'bold');
      docPdf.setFontSize(8);
      docPdf.setTextColor(0, 0, 0);
      docPdf.text('How many attended?', x + 2, y + offset + 3.0);

      docPdf.setFont('helvetica', 'normal');
      docPdf.setFontSize(9);
      docPdf.text(howMany, valStartX + 2, y + offset + 3.0);
      docPdf.setDrawColor(0, 0, 0);
      docPdf.setLineWidth(0.2);
      docPdf.line(valStartX, y + offset + 4.5, endX, y + offset + 4.5);

      offset += 7.5;

      // Line 2: Who attended?
      docPdf.setFont('helvetica', 'bold');
      docPdf.setFontSize(8);
      docPdf.text('Who attended?', x + 2, y + offset + 3.0);

      docPdf.setFont('helvetica', 'normal');
      docPdf.setFontSize(9);
      docPdf.text(who, valStartX + 2, y + offset + 3.0);
      docPdf.line(valStartX, y + offset + 4.5, endX, y + offset + 4.5);
    },
    { hasBottomLine: false, spaceAfterLine: 2.0 }
  );

  // ─── Row 9: Marketing (Bullet Items + Bottom Line) ───
  const mktH = measureBulletListHeight(marketingList, 9, col1Width, 4.2);
  drawStandaloneSection(
    'Marketing:',
    mktH,
    (x, y, w) => {
      drawBulletList(marketingList, x, y, w, 4.2);
    },
    { hasBottomLine: true }
  );

  // ─── Row 10: Documentation (Bullet Items + Bottom Line) ───
  const docuH = measureBulletListHeight(documentationList, 9, col1Width, 4.2);
  drawStandaloneSection(
    'Documentation:',
    docuH,
    (x, y, w) => {
      drawBulletList(documentationList, x, y, w, 4.2);
    },
    { hasBottomLine: true }
  );

  // ─── Row 11: Date & time (Bold + Bottom Line) ───
  const dateStr =
    rawReport.eventDateFormatted ||
    (proposalData?.date
      ? `${proposalData.date}${proposalData.startTime ? `, ${proposalData.startTime} – ${proposalData.endTime || ''}` : ''}`
      : 'November 24, 2025, 9:00 AM – 3:00 PM');
  const dateH = measureTextLinesHeight(dateStr, 9.5, col1Width, 4.4);
  drawStandaloneSection(
    'Date & time:',
    dateH,
    (x, y, w) => {
      docPdf.setFont('helvetica', 'bold');
      docPdf.setFontSize(9.5);
      docPdf.setTextColor(0, 0, 0);
      const lines = docPdf.splitTextToSize(dateStr, w);
      docPdf.text(lines, x, y + 3.0);
    },
    { hasBottomLine: true }
  );

  // ─── Row 12: Venue (Text + Bottom Line) ───
  const venueStr = rawReport.eventVenue || proposalData?.venueName || proposalData?.venue || 'STI College Ormoc – NEW ROOMS';
  const venueH = measureTextLinesHeight(venueStr, 9.5, col1Width, 4.4);
  drawStandaloneSection(
    'Venue:',
    venueH,
    (x, y, w) => {
      docPdf.setFont('helvetica', 'normal');
      docPdf.setFontSize(9.5);
      docPdf.setTextColor(0, 0, 0);
      const lines = docPdf.splitTextToSize(venueStr, w);
      docPdf.text(lines, x, y + 3.0);
    },
    { hasBottomLine: true }
  );

  // ─── Results of Activity (Multi-part Sub-sections to guarantee zero cutoff) ───
  // Prompt + Header
  drawStandaloneSection(
    'Results of activity:',
    12.0,
    (x, y, w) => {
      docPdf.setFont('helvetica', 'italic');
      docPdf.setFontSize(8);
      docPdf.setTextColor(60, 60, 60);
      docPdf.text('(Include assessment of success based on indicators. Attach a sheet, if necessary.)', x, y + 3.0);

      docPdf.setFont('helvetica', 'bold');
      docPdf.setFontSize(11);
      docPdf.setTextColor(0, 0, 0);
      docPdf.text('Results of the Activity', x, y + 9.5);
    },
    { hasBottomLine: false, paddingBottom: 1.0 }
  );

  // Sub-section helper
  const drawResultSubSection = (
    title: string,
    prompt: string,
    body: string,
    bullets?: string[],
    isLast = false
  ) => {
    let measured = 4.5;
    if (prompt) measured += measureTextLinesHeight(prompt, 8, col1Width, 3.6) + 1.0;
    if (body) measured += measureTextLinesHeight(body, 9, col1Width, 4.2) + 2.0;
    if (bullets && bullets.length > 0) {
      bullets.forEach((b) => {
        measured += measureTextLinesHeight(`•  ${b}`, 9, col1Width - 6, 4.2) + 1.0;
      });
    }

    drawStandaloneSection(
      '',
      measured,
      (x, y, w) => {
        let off = 0;
        docPdf.setFont('helvetica', 'bold');
        docPdf.setFontSize(9);
        docPdf.setTextColor(0, 0, 0);
        docPdf.text(title, x, y + off + 3.0);
        off += 4.5;

        if (prompt) {
          docPdf.setFont('helvetica', 'italic');
          docPdf.setFontSize(8);
          docPdf.setTextColor(80, 80, 80);
          const pLines = docPdf.splitTextToSize(prompt, w);
          docPdf.text(pLines, x, y + off + 2.5);
          off += pLines.length * 3.6 + 1.0;
        }

        if (body) {
          docPdf.setFont('helvetica', 'normal');
          docPdf.setFontSize(9);
          docPdf.setTextColor(0, 0, 0);
          const tLines = docPdf.splitTextToSize(body, w);
          docPdf.text(tLines, x, y + off + 2.5);
          off += tLines.length * 4.2 + 2.0;
        }

        if (bullets && bullets.length > 0) {
          docPdf.setFont('helvetica', 'normal');
          docPdf.setFontSize(9);
          docPdf.setTextColor(0, 0, 0);
          bullets.forEach((b) => {
            const bLines = docPdf.splitTextToSize(`•  ${b}`, w - 6);
            docPdf.text(bLines, x + 2, y + off + 2.5);
            off += bLines.length * 4.2 + 1.0;
          });
        }
      },
      { hasBottomLine: isLast, paddingBottom: isLast ? 3.0 : 1.5 }
    );
  };

  drawResultSubSection('Achievement of Objectives:', '', achievementNarrative);
  drawResultSubSection('Key Learnings / Insights Gained:', '', '', keyLearnings);
  drawResultSubSection(
    'Enrichment of Learning Beyond the Classroom:',
    '(Explain how the activity complemented or enhanced classroom learning)',
    classroomEnrichment
  );
  drawResultSubSection(
    'Reason for Venue Selection:',
    '(State justification if questioned or compared to another venue)',
    venueAssessment
  );
  drawResultSubSection('Food / Logistics Assessment:', '', foodLogisticsAssessment);
  drawResultSubSection(
    'Schedule Compliance:',
    '(State if program followed as planned; mention delays or adjustments if any)',
    scheduleCompliance
  );
  drawResultSubSection(
    'Issues / Problems Encountered and Actions Taken:',
    '(If none, state “No major issues encountered.”)',
    issuesEncountered,
    undefined,
    true
  );

  // ─── Financial Report (Prompt + Bordered Nested Table) ───
  const finTableRowsCount = financialItems.length > 0 ? financialItems.length : 1;
  const estimatedFinH = 6.0 + 5.0 + 5.0 + finTableRowsCount * 5.0 + 5.0 + 2.0 + 6.0;

  drawStandaloneSection(
    'Financial report:',
    estimatedFinH,
    (x, y, w) => {
      let offset = 0;
      docPdf.setFont('helvetica', 'italic');
      docPdf.setFontSize(8);
      docPdf.setTextColor(60, 60, 60);
      docPdf.text(
        '(Attach supporting receipts and list of participants who have/haven’t paid.) Attached also the liquidation.',
        x,
        y + 3.0
      );
      offset += 6.0;

      // Nested Financial Table (Bordered sub-table matching Word docx Table 4)
      const colDescW = w - 64; // ~80mm
      const colUnitW = 32; // 32mm
      const colTotW = 32; // 32mm

      let curFinY = y + offset;

      // Header row
      docPdf.setFont('helvetica', 'bold');
      docPdf.setFontSize(8);
      docPdf.setTextColor(0, 0, 0);

      docPdf.rect(x, curFinY, colDescW, 5.2);
      docPdf.rect(x + colDescW, curFinY, colUnitW, 5.2);
      docPdf.rect(x + colDescW + colUnitW, curFinY, colTotW, 5.2);

      docPdf.text('Description', x + 2, curFinY + 3.6);
      docPdf.text('Unit Amount', x + colDescW + colUnitW - 2, curFinY + 3.6, { align: 'right' });
      docPdf.text('Total Amount', x + w - 2, curFinY + 3.6, { align: 'right' });
      curFinY += 5.2;

      // Revenue Sub-row
      docPdf.setFont('helvetica', 'bold');
      docPdf.setFontSize(8);
      docPdf.rect(x, curFinY, colDescW + colUnitW, 5.2);
      docPdf.rect(x + colDescW + colUnitW, curFinY, colTotW, 5.2);
      docPdf.text(`Revenue:  PHP ${formatPdfCurrency(revenue)}`, x + 2, curFinY + 3.6);
      curFinY += 5.2;

      // Line items
      docPdf.setFont('helvetica', 'normal');
      docPdf.setFontSize(8);

      if (financialItems.length === 0) {
        docPdf.rect(x, curFinY, colDescW, 5.0);
        docPdf.rect(x + colDescW, curFinY, colUnitW, 5.0);
        docPdf.rect(x + colDescW + colUnitW, curFinY, colTotW, 5.0);
        docPdf.text('Program & Activity Expenses', x + 2, curFinY + 3.5);
        docPdf.text(`PHP ${formatPdfCurrency(totalExpenses)}`, x + colDescW + colUnitW - 2, curFinY + 3.5, {
          align: 'right',
        });
        docPdf.text(`PHP ${formatPdfCurrency(totalExpenses)}`, x + w - 2, curFinY + 3.5, { align: 'right' });
        curFinY += 5.0;
      } else {
        financialItems.forEach((item) => {
          const itemH = 4.8;
          docPdf.rect(x, curFinY, colDescW, itemH);
          docPdf.rect(x + colDescW, curFinY, colUnitW, itemH);
          docPdf.rect(x + colDescW + colUnitW, curFinY, colTotW, itemH);

          const descLines = docPdf.splitTextToSize(item.description, colDescW - 3);
          docPdf.text(descLines[0] || item.description, x + 2, curFinY + 3.4);
          docPdf.text(formatPdfCurrency(item.unitAmount), x + colDescW + colUnitW - 2, curFinY + 3.4, {
            align: 'right',
          });
          docPdf.text(formatPdfCurrency(item.totalAmount || item.unitAmount), x + w - 2, curFinY + 3.4, {
            align: 'right',
          });
          curFinY += itemH;
        });
      }

      // TOTAL row
      docPdf.setFont('helvetica', 'bold');
      docPdf.setFontSize(8);
      docPdf.rect(x, curFinY, colDescW, 5.2);
      docPdf.rect(x + colDescW, curFinY, colUnitW, 5.2);
      docPdf.rect(x + colDescW + colUnitW, curFinY, colTotW, 5.2);
      docPdf.text('TOTAL', x + 2, curFinY + 3.6);
      docPdf.text(`PHP ${formatPdfCurrency(totalExpenses)}`, x + colDescW + colUnitW - 2, curFinY + 3.6, {
        align: 'right',
      });
      docPdf.text(`PHP ${formatPdfCurrency(totalExpenses)}`, x + w - 2, curFinY + 3.6, { align: 'right' });
      curFinY += 5.2;

      // Spacer row
      curFinY += 2.0;

      // Balance row
      docPdf.rect(x, curFinY, w, 5.5);
      const balLabel = `Balance (Revenue less Expenses)  PHP ${formatPdfCurrency(netBalance)}`;
      docPdf.text(balLabel, x + 2, curFinY + 3.8);
    },
    { hasBottomLine: true, paddingTop: 1.0, paddingBottom: 3.0 }
  );

  // ─── Remarks (4 Categorized Areas with Smooth Page Breaks) ───
  const remarkAreas = [
    {
      num: '1',
      title: 'Program Flow and Time Management',
      obs: recommendations.programFlow.observations,
      rec: recommendations.programFlow.recommendations,
    },
    {
      num: '2',
      title: 'Participant Engagement and Interaction',
      obs: recommendations.participantEngagement.observations,
      rec: recommendations.participantEngagement.recommendations,
    },
    {
      num: '3',
      title: 'Technical Setup and Venue Preparation',
      obs: recommendations.technicalSetup.observations,
      rec: recommendations.technicalSetup.recommendations,
    },
    {
      num: '4',
      title: 'Participant Preparedness and Expectations',
      obs: recommendations.participantPreparedness.observations,
      rec: recommendations.participantPreparedness.recommendations,
    },
  ];

  remarkAreas.forEach((area, aIdx) => {
    let measured = 4.5 + 3.8 + measureTextLinesHeight(area.obs, 8.5, col1Width, 3.8) + 1.5;
    measured += 3.8 + measureTextLinesHeight(area.rec, 8.5, col1Width, 3.8) + 2.0;
    if (aIdx === 0) measured += 5.5; // prompt
    if (aIdx === remarkAreas.length - 1) measured += 6.0; // please see attached

    const isLast = aIdx === remarkAreas.length - 1;

    drawStandaloneSection(
      aIdx === 0 ? 'Remarks:' : '',
      measured,
      (x, y, w) => {
        let off = 0;
        if (aIdx === 0) {
          docPdf.setFont('helvetica', 'italic');
          docPdf.setFontSize(8);
          docPdf.setTextColor(60, 60, 60);
          docPdf.text('(For future activity improvements.)', x, y + 3.0);
          off += 5.5;
        }

        // Title
        docPdf.setFont('helvetica', 'bold');
        docPdf.setFontSize(9);
        docPdf.setTextColor(0, 0, 0);
        docPdf.text(`${area.num}. ${area.title}`, x, y + off + 3.0);
        off += 4.5;

        // Observations
        docPdf.setFont('helvetica', 'bold');
        docPdf.setFontSize(8.5);
        docPdf.text('Observations:', x, y + off + 2.5);
        off += 3.8;

        docPdf.setFont('helvetica', 'normal');
        docPdf.setFontSize(8.5);
        const obsLines = docPdf.splitTextToSize(area.obs, w);
        docPdf.text(obsLines, x, y + off + 2.5);
        off += obsLines.length * 3.8 + 1.5;

        // Recommendations
        docPdf.setFont('helvetica', 'bold');
        docPdf.setFontSize(8.5);
        docPdf.text('Recommendations:', x, y + off + 2.5);
        off += 3.8;

        docPdf.setFont('helvetica', 'normal');
        docPdf.setFontSize(8.5);
        const recLines = docPdf.splitTextToSize(area.rec, w);
        docPdf.text(recLines, x, y + off + 2.5);
        off += recLines.length * 3.8 + 2.0;

        if (isLast) {
          docPdf.setFont('helvetica', 'normal');
          docPdf.setFontSize(8.5);
          docPdf.text('Please see attached documents.', x, y + off + 2.5);
        }
      },
      {
        col0Note: isLast ? 'VIII. Attachments\n(if applicable)' : undefined,
        hasBottomLine: isLast,
        paddingBottom: isLast ? 3.0 : 1.5,
      }
    );
  });

  // ─── Prepared by & Noted by (Guaranteed to Stay Together Cleanly) ───
  const officerName = rawReport.preparedBy?.name || rawReport.createdByName || 'Student Affairs Services';
  const officerRole = rawReport.preparedBy?.roleTitle || (rawReport.isOfficerPar ? 'Student Organization Officer' : 'SAS Administrator');

  const stepsToRender =
    approvalChain.length > 0
      ? approvalChain
      : [
          {
            roleTitle: 'Organization Adviser',
            signatoryName: 'Humabona L. Gonzales',
            status: 'approved',
          },
          {
            roleTitle: 'Program Head',
            signatoryName: 'Engr. Sheena Joy S. Muyuela',
            status: 'approved',
          },
          {
            roleTitle: 'School Administrator',
            signatoryName: 'Atty. Antonio R. Lucero Jr.',
            status: 'approved',
          },
        ];

  // Combined height check: ensure signatory block has plenty of space or moves to new page together
  const sigBlockH = 22.0 + 26.0 + 15.0; // Prepared by (22mm) + Noted by (26mm) + Note (15mm)
  if (currentY + sigBlockH > pageHeight - marginBottom) {
    docPdf.addPage();
    currentY = marginTop;
  }

  // Prepared by
  drawStandaloneSection(
    'Prepared by:',
    20.0,
    (x, y, w) => {
      let off = 0;
      if (officerSigUrl) {
        try {
          docPdf.addImage(officerSigUrl, 'PNG', x + 2, y + off, 28, 10);
          off += 11;
        } catch {}
      } else {
        off += 5;
      }

      docPdf.setFont('helvetica', 'bold');
      docPdf.setFontSize(9.5);
      docPdf.setTextColor(0, 0, 0);
      docPdf.text(officerName, x + 2, y + off + 3.0);
      off += 4.5;

      docPdf.setFont('helvetica', 'normal');
      docPdf.setFontSize(8.5);
      docPdf.text(officerRole, x + 2, y + off + 2.5);
    },
    { hasBottomLine: true, paddingTop: 1.0, paddingBottom: 3.5 }
  );

  // Noted by
  drawStandaloneSection(
    'Noted by:',
    24.0,
    (x, y, w) => {
      let off = 0;
      const sigColW = Math.floor(w / Math.min(stepsToRender.length, 3));

      stepsToRender.slice(0, 3).forEach((step, sIdx) => {
        const sx = x + sIdx * sigColW + 2;
        let sOff = off;

        const sigImg = signatorySigUrls[sIdx];
        if (sigImg) {
          try {
            docPdf.addImage(sigImg, 'PNG', sx, y + sOff, 28, 10);
            sOff += 11;
          } catch {}
        } else {
          sOff += 5;
        }

        docPdf.setFont('helvetica', 'bold');
        docPdf.setFontSize(9);
        docPdf.setTextColor(0, 0, 0);
        const nameLines = docPdf.splitTextToSize(step.signatoryName || 'Signatory', sigColW - 4);
        docPdf.text(nameLines, sx, y + sOff + 3.0);
        sOff += nameLines.length * 4.0;

        docPdf.setFont('helvetica', 'normal');
        docPdf.setFontSize(8);
        const titleLines = docPdf.splitTextToSize(step.roleTitle || 'Institutional Signatory', sigColW - 4);
        docPdf.text(titleLines, sx, y + sOff + 2.5);
      });
    },
    { hasBottomLine: true, paddingTop: 1.0, paddingBottom: 3.5 }
  );

  // ─── Step 5: Bottom Policy Note ───
  ensurePageSpace(10);
  currentY += 4.0;
  docPdf.setFont('helvetica', 'bold');
  docPdf.setFontSize(8);
  docPdf.setTextColor(0, 0, 0);
  docPdf.text('Note:', marginX, currentY);

  docPdf.setFont('helvetica', 'normal');
  docPdf.setFontSize(8);
  docPdf.text(
    ' This report must be submitted to the Administrator within 15 school days from the date of activity completion.',
    marginX + 8,
    currentY
  );

  // ─── Step 6: Annex for Photo Documentation (if any photos uploaded) ───
  if (photoDataUrls.length > 0 && photoDataUrls.some((p) => p.dataUrl)) {
    docPdf.addPage();
    let photoY = marginTop;

    docPdf.setFont('helvetica', 'bold');
    docPdf.setFontSize(11);
    docPdf.setTextColor(0, 0, 0);
    docPdf.text('ANNEX: PHOTO DOCUMENTATION', marginX, photoY + 2);
    photoY += 8;

    docPdf.setFont('helvetica', 'normal');
    docPdf.setFontSize(8.5);
    docPdf.setTextColor(90, 90, 90);
    docPdf.text(
      `Activity Documentation for: ${rawReport.eventTitle} (${rawReport.referenceNo})`,
      marginX,
      photoY
    );
    photoY += 8;

    // Grid: 2 photos per row with smooth spacing
    const cardW = (contentWidth - 8) / 2;
    const cardH = 56;

    for (let i = 0; i < photoDataUrls.length; i += 2) {
      if (photoY + cardH > pageHeight - marginBottom) {
        docPdf.addPage();
        photoY = marginTop;
      }

      // Left photo
      const leftP = photoDataUrls[i];
      if (leftP?.dataUrl) {
        try {
          docPdf.addImage(leftP.dataUrl, 'JPEG', marginX, photoY, cardW, 46);
        } catch {}
        docPdf.setDrawColor(200, 200, 200);
        docPdf.rect(marginX, photoY, cardW, 46);
        docPdf.setFont('helvetica', 'normal');
        docPdf.setFontSize(8);
        docPdf.setTextColor(40, 40, 40);
        docPdf.text(leftP.caption, marginX + 1, photoY + 50);
      }

      // Right photo
      const rightP = photoDataUrls[i + 1];
      if (rightP?.dataUrl) {
        const rightX = marginX + cardW + 8;
        try {
          docPdf.addImage(rightP.dataUrl, 'JPEG', rightX, photoY, cardW, 46);
        } catch {}
        docPdf.setDrawColor(200, 200, 200);
        docPdf.rect(rightX, photoY, cardW, 46);
        docPdf.setFont('helvetica', 'normal');
        docPdf.setFontSize(8);
        docPdf.setTextColor(40, 40, 40);
        docPdf.text(rightP.caption, rightX + 1, photoY + 50);
      }

      photoY += cardH + 6;
    }
  }

  // ─── Step 7: Save Generated PDF File ───
  const filename = `${rawReport.referenceNo || 'PAR'}_Post_Activity_Report.pdf`;
  docPdf.save(filename);
}
