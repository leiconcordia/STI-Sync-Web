import jsPDF from 'jspdf';
import type { PostActivityReportDocument } from '../types/par.types';
import { STI_LOGO_BASE64 } from '../../activity-proposals/utils/sti-logo-asset';

function formatPdfAmount(amount: number | undefined | null): string {
  if (amount === undefined || amount === null || isNaN(amount)) return '0.00';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export async function exportPostActivityReportPDF(report: PostActivityReportDocument): Promise<void> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const checkPageBreak = (neededHeight: number) => {
    if (y + neededHeight > pageHeight - margin) {
      doc.addPage();
      y = margin;
      drawHeaderSmall();
    }
  };

  const drawHeaderSmall = () => {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(`STI College — Post-Activity Report (${report.referenceNo})`, margin, 12);
    doc.setDrawColor(220, 220, 220);
    doc.line(margin, 14, pageWidth - margin, 14);
    y = margin;
  };

  // ─── First Page Top Header ───
  try {
    if (STI_LOGO_BASE64) {
      doc.addImage(STI_LOGO_BASE64, 'PNG', margin, y, 28, 12);
    }
  } catch {}

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  const dateStr = report.submittedAt
    ? new Date(
        typeof (report.submittedAt as any).toDate === 'function'
          ? (report.submittedAt as any).toDate()
          : report.submittedAt
      ).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  
  doc.text(`Date Filed: ${dateStr}`, pageWidth - margin, y + 6, { align: 'right' });
  doc.text(`Ref No: ${report.referenceNo}`, pageWidth - margin, y + 11, { align: 'right' });

  y += 18;

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(0, 32, 96); // STI Navy
  doc.text('POST-ACTIVITY REPORT', pageWidth / 2, y, { align: 'center' });
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text('Institutional Compliance & Evaluation Document', pageWidth / 2, y, { align: 'center' });

  y += 8;
  doc.setDrawColor(0, 32, 96);
  doc.setLineWidth(0.8);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  // ─── Key Information Grid ───
  const infoRows = [
    ['Activity / Event Title:', report.eventTitle || '—'],
    ['Hosting Body / Organization:', report.organizationName || 'Student Affairs Services'],
    ['Date & Venue Conducted:', `${report.eventDateFormatted || '—'}  |  ${report.eventVenue || '—'}`],
    ['Academic Term:', `${report.semester || ''} ${report.schoolYear ? `(A.Y. ${report.schoolYear})` : ''}`.trim() || '—'],
    ['Financial Clearance Ref:', report.liquidationRefNumber ? `${report.liquidationRefNumber} (LF-01 Cleared)` : 'Not Required / Self-Funded'],
  ];

  doc.setFontSize(9);
  infoRows.forEach(([lbl, val]) => {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(40, 40, 40);
    doc.text(lbl, margin, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(20, 20, 20);
    doc.text(val, margin + 55, y);
    y += 5.5;
  });

  y += 3;

  // ─── Section Helper ───
  const drawSectionHeader = (title: string) => {
    checkPageBreak(14);
    y += 2;
    doc.setFillColor(240, 244, 250);
    doc.rect(margin, y - 4, contentWidth, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(0, 40, 120);
    doc.text(title, margin + 3, y + 1);
    y += 7;
  };

  // ─── Section 1: Attendance Verification ───
  drawSectionHeader('I. ATTENDANCE & PARTICIPATION SUMMARY');
  const regCount = report.attendanceSummary?.registeredCount || 0;
  const attCount = report.attendanceSummary?.attendedCount || 0;
  const rate = regCount > 0 ? Math.round((attCount / regCount) * 100) : (attCount > 0 ? 100 : 0);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(40, 40, 40);
  doc.text(`Target Participants: ${report.attendanceSummary?.targetAudience || 'Enrolled Students'}`, margin + 3, y);
  y += 5;
  doc.text(`Actual Attendees: ${report.attendanceSummary?.whoAttended || 'College / SHS Students'}`, margin + 3, y);
  y += 5;
  doc.text(
    `Official Scanner Log: ${attCount} Verified Attendees ${regCount > 0 ? `out of ${regCount} Registered (${rate}% Turnout)` : ''}`,
    margin + 3,
    y
  );
  y += 7;

  // ─── Section 2: Financial Clearance ───
  drawSectionHeader('II. FINANCIAL CLEARANCE & DISBURSEMENT SUMMARY (FORM LF-01)');
  const rev = report.financialSummary?.totalRevenue || 0;
  const disb = report.financialSummary?.totalDisbursed || 0;
  const bal = report.financialSummary?.surplusOrDeficit || (rev - disb);

  doc.setFontSize(9);
  doc.text(`Total Collections / Revenue: PHP ${formatPdfAmount(rev)}`, margin + 3, y);
  y += 5;
  doc.text(`Total Disbursed Expenses: PHP ${formatPdfAmount(disb)}`, margin + 3, y);
  y += 5;
  doc.setFont('helvetica', 'bold');
  const balText = bal >= 0 ? `Net Surplus / Cash Balance: PHP ${formatPdfAmount(bal)}` : `Net Deficit: PHP (${formatPdfAmount(Math.abs(bal))})`;
  doc.text(balText, margin + 3, y);
  doc.setFont('helvetica', 'normal');
  y += 7;

  // ─── Section 3: Objectives & Post-Event Evaluation ───
  drawSectionHeader('III. EVALUATION OF OBJECTIVES & KEY LEARNINGS');
  doc.setFont('helvetica', 'bold');
  const objStatusLabel =
    report.results?.objectiveStatus === 'fully_achieved'
      ? 'Fully Achieved'
      : report.results?.objectiveStatus === 'partially_achieved'
      ? 'Partially Achieved'
      : 'Unmet';
  doc.text(`Objectives Status: [ ${objStatusLabel} ]`, margin + 3, y);
  y += 5;

  doc.setFont('helvetica', 'normal');
  if (report.results?.achievementNarrative) {
    const narrativeLines = doc.splitTextToSize(
      `Narrative: ${report.results.achievementNarrative}`,
      contentWidth - 6
    );
    checkPageBreak(narrativeLines.length * 4.5 + 4);
    doc.text(narrativeLines, margin + 3, y);
    y += narrativeLines.length * 4.5 + 2;
  }

  if (report.results?.keyLearnings && report.results.keyLearnings.length > 0) {
    checkPageBreak(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Key Learnings & Student Insights:', margin + 3, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    report.results.keyLearnings.forEach((item) => {
      const bulletLines = doc.splitTextToSize(`• ${item}`, contentWidth - 8);
      checkPageBreak(bulletLines.length * 4.5);
      doc.text(bulletLines, margin + 6, y);
      y += bulletLines.length * 4.5;
    });
    y += 2;
  }

  if (report.results?.classroomEnrichment) {
    const enrichLines = doc.splitTextToSize(
      `Curriculum & Classroom Enrichment: ${report.results.classroomEnrichment}`,
      contentWidth - 6
    );
    checkPageBreak(enrichLines.length * 4.5 + 3);
    doc.text(enrichLines, margin + 3, y);
    y += enrichLines.length * 4.5 + 3;
  }

  // ─── Section 4: Operational & Venue Evaluation ───
  drawSectionHeader('IV. OPERATIONAL & VENUE ASSESSMENT');
  const venueText = report.results?.venueAssessment || 'Venue and facilities were fully functional and compliant with safety guidelines.';
  const venueLines = doc.splitTextToSize(`Venue & Facilities: ${venueText}`, contentWidth - 6);
  checkPageBreak(venueLines.length * 4.5 + 2);
  doc.text(venueLines, margin + 3, y);
  y += venueLines.length * 4.5 + 2;

  const logText = report.results?.logisticsAssessment || 'Logistical coordination, registration, and ushering proceeded smoothly.';
  const logLines = doc.splitTextToSize(`Logistics & Materials: ${logText}`, contentWidth - 6);
  checkPageBreak(logLines.length * 4.5 + 2);
  doc.text(logLines, margin + 3, y);
  y += logLines.length * 4.5 + 2;

  const issText = report.results?.issuesEncountered || 'No major issues or bottlenecks encountered.';
  const issLines = doc.splitTextToSize(`Issues & Bottlenecks: ${issText}`, contentWidth - 6);
  checkPageBreak(issLines.length * 4.5 + 4);
  doc.text(issLines, margin + 3, y);
  y += issLines.length * 4.5 + 4;

  // ─── Section 5: Categorized Recommendations (Exact 4 STI standard areas) ───
  drawSectionHeader('V. CATEGORIZED RECOMMENDATIONS (POST-MORTEM ACTION ITEMS)');
  const recAreas = [
    { title: '1. Program Flow & Time Management', data: report.recommendations?.programFlow },
    { title: '2. Participant Engagement & Interaction', data: report.recommendations?.participantEngagement },
    { title: '3. Technical Setup, Audio-Visual & Equipment', data: report.recommendations?.technicalSetup },
    { title: '4. Participant Preparedness & Prerequisite Knowledge', data: report.recommendations?.participantPreparedness },
  ];

  recAreas.forEach((area) => {
    checkPageBreak(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 30, 30);
    doc.text(area.title, margin + 3, y);
    y += 4.5;
    doc.setFont('helvetica', 'normal');
    const obs = area.data?.observations || 'Smooth execution with active participation.';
    const rec = area.data?.recommendations || 'Maintain current protocols for upcoming school events.';
    const obsLines = doc.splitTextToSize(`• Observations: ${obs}`, contentWidth - 8);
    const recLines = doc.splitTextToSize(`• Recommendations: ${rec}`, contentWidth - 8);
    checkPageBreak((obsLines.length + recLines.length) * 4.5 + 3);
    doc.text(obsLines, margin + 6, y);
    y += obsLines.length * 4.5;
    doc.text(recLines, margin + 6, y);
    y += recLines.length * 4.5 + 3;
  });

  // ─── Section 6: Photo Documentation ───
  if (report.photos && report.photos.length > 0) {
    drawSectionHeader('VI. PHOTO DOCUMENTATION');
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(80, 80, 80);
    doc.text('Official high-resolution event photographic evidence captured on-site:', margin + 3, y);
    y += 5;

    report.photos.slice(0, 4).forEach((p, idx) => {
      checkPageBreak(8);
      doc.setFont('helvetica', 'normal');
      doc.text(`[Photo ${idx + 1}] ${p.caption || 'Event Documentation'}`, margin + 6, y);
      y += 4.5;
    });
    y += 3;
  }

  // ─── Section 7: Signatories Pipeline ───
  checkPageBreak(50);
  drawSectionHeader('VII. INSTITUTIONAL ENDORSEMENTS & CLEARANCE SIGNATORIES');

  y += 4;
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30, 30, 30);

  // Prepared By Column
  const colWidth = (contentWidth - 6) / 3;
  const prepName = report.preparedBy?.name || report.createdByName || 'Officer';
  const prepRole = report.preparedBy?.roleTitle || (report.creatorRole === 'sas_admin' ? 'SAS Adviser' : 'Event Organizer');

  doc.setFont('helvetica', 'bold');
  doc.text('Prepared By:', margin + 3, y);
  y += 10;
  if (report.preparedBy?.signatureUrl) {
    try {
      doc.addImage(report.preparedBy.signatureUrl, 'PNG', margin + 3, y - 8, 26, 8);
    } catch {}
  }
  doc.setLineWidth(0.4);
  doc.line(margin + 3, y, margin + 3 + colWidth - 6, y);
  doc.text(prepName, margin + 3, y + 4);
  doc.setFont('helvetica', 'normal');
  doc.text(prepRole, margin + 3, y + 8);

  // Signatory Steps
  const chain = report.approvalChain || [];
  if (chain.length > 0) {
    const endorsementSteps = chain.filter((s) => s.actionType === 'endorse' || s.actionType === 'check');
    const approvalSteps = chain.filter((s) => s.actionType === 'approve');

    // Endorsed By
    if (endorsementSteps.length > 0) {
      const step1 = endorsementSteps[0];
      const col2X = margin + 3 + colWidth;
      doc.setFont('helvetica', 'bold');
      doc.text('Endorsed By:', col2X, y - 10);
      if (step1.signatureUrl) {
        try {
          doc.addImage(step1.signatureUrl, 'PNG', col2X, y - 8, 26, 8);
        } catch {}
      }
      doc.line(col2X, y, col2X + colWidth - 6, y);
      doc.text(step1.signatoryName, col2X, y + 4);
      doc.setFont('helvetica', 'normal');
      doc.text(step1.roleTitle, col2X, y + 8);
    }

    // Approved By
    if (approvalSteps.length > 0) {
      const step2 = approvalSteps[0];
      const col3X = margin + 3 + colWidth * 2;
      doc.setFont('helvetica', 'bold');
      doc.text('Approved By:', col3X, y - 10);
      if (step2.signatureUrl) {
        try {
          doc.addImage(step2.signatureUrl, 'PNG', col3X, y - 8, 26, 8);
        } catch {}
      }
      doc.line(col3X, y, col3X + colWidth - 6, y);
      doc.text(step2.signatoryName, col3X, y + 4);
      doc.setFont('helvetica', 'normal');
      doc.text(step2.roleTitle, col3X, y + 8);
    }
  }

  y += 18;

  // 15-school-day rule footer notice
  checkPageBreak(12);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(120, 120, 120);
  doc.text(
    'Policy Compliance: This Post-Activity Report must be filed within fifteen (15) school days following event conclusion.',
    margin,
    pageHeight - 10
  );

  const safeFilename = `${report.referenceNo || 'PAR'}_${(report.eventTitle || 'Report')
    .replace(/[^a-zA-Z0-9]/g, '_')
    .slice(0, 30)}.pdf`;
  doc.save(safeFilename);
}
