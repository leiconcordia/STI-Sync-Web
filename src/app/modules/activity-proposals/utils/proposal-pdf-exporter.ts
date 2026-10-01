/**
 * src/app/modules/activity-proposals/utils/proposal-pdf-exporter.ts
 *
 * Official publication-quality A4 PDF generation engine for STI College Ormoc
 * Activity Proposals (Official Form AP-01).
 *
 * Adheres strictly and verbatim to official STI institutional template:
 * - AP_FORMAT_EMPTY.docx
 * - AP IT Expert Talk 1.docx
 * - AP2025 (1).docx
 * - Activity Proposal for Esports Cup local level.docx
 * - AP EVRAA.docx
 *
 * EXACT INSTITUTIONAL STYLING (matching AP_FORMAT_EMPTY.docx):
 * - NO artificial grid/box borders around labels or outer pages
 * - Unbordered bold label column on the left (e.g. "Activity title:", "Description:")
 * - Content on the right with horizontal underline dividing rules
 * - Authentic top header: STI logo (left) + "Date: ____________________" (right) + Bold "Activity Proposal" heading
 * - Exact 3-column Task list (Task, Person Assigned, Date to be Completed) with dividing lines
 * - Exact 6-column Financial projections matrix with dividing lines, totals, and balance
 * - Signature lines (underlines) with affixed digital signatures, bold names, and formal position titles
 * - Verbatim 15-day administrative policy note below table
 * - Pure black-and-white / grayscale matching institutional paperwork
 */

import jsPDF from 'jspdf';
import type { ActivityProposal, ProposalApprovalStep, ProposalTargetAudience } from '../types/proposal.types';
import { STI_LOGO_BASE64 } from './sti-logo-asset';

export interface ExportProposalPdfOptions {
  watermarkStatus?: boolean;
}

/**
 * Format currency without the unsupported unicode peso glyph for jsPDF helvetica
 */
function formatPdfAmount(amount: number | undefined | null): string {
  if (amount === undefined || amount === null || isNaN(amount)) return '0.00';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format 24h time 'HH:mm' to 12h time 'h:mm AM/PM'
 */
function formatTime12(timeStr?: string): string {
  if (!timeStr) return '';
  const [hStr, mStr] = timeStr.split(':');
  const h = parseInt(hStr, 10);
  if (isNaN(h)) return timeStr;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  const m = mStr ? mStr.padStart(2, '0') : '00';
  return `${h12}:${m} ${ampm}`;
}

/**
 * Cleanly format any unknown list input into string lines
 */
function toLines(input: unknown): string[] {
  if (!input) return [];
  const rawList: string[] = Array.isArray(input)
    ? input.map((item) => (typeof item === 'string' ? item : String(item)))
    : typeof input === 'string'
    ? [input]
    : [String(input)];

  return rawList
    .flatMap((item) => item.split(/\n|\s+\/\/\s+/))
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Convert Target Audience object to human readable string
 */
function formatTargetMarket(aud?: ProposalTargetAudience): string {
  if (!aud) return 'All enrolled students of STI College Ormoc';
  if (aud.allStudents) return 'Open to all enrolled students of STI College Ormoc';
  const parts: string[] = [];
  if (aud.courseCodes && aud.courseCodes.length > 0) {
    parts.push(aud.courseCodes.join(', '));
  } else if (aud.departments && aud.departments.length > 0) {
    parts.push(aud.departments.join(', '));
  }
  if (aud.yearLevels && aud.yearLevels.length > 0) {
    parts.push(aud.yearLevels.join(', '));
  }
  if (aud.academicLevels && aud.academicLevels.length > 0) {
    parts.push(aud.academicLevels.join(', '));
  }
  return parts.length > 0 ? parts.join(' - ') : 'STI College Ormoc Students';
}

/**
 * Convert sessions or date fields to readable string
 */
function formatDateAndTime(proposal: Partial<ActivityProposal>): string {
  if (proposal.sessions && proposal.sessions.length > 0) {
    return proposal.sessions
      .map((s) => {
        const d = s.date || '';
        const t = s.startTime && s.endTime ? ` (${formatTime12(s.startTime)} – ${formatTime12(s.endTime)})` : '';
        return `${d}${t}`.trim();
      })
      .filter(Boolean)
      .join('\n');
  }
  const d = proposal.date || '';
  const t = proposal.startTime && proposal.endTime ? ` (${formatTime12(proposal.startTime)} – ${formatTime12(proposal.endTime)})` : '';
  return `${d}${t}`.trim() || 'To be announced';
}

/**
 * Fetch and convert an image URL or dataURL into a base64 string for jsPDF
 */
async function getBase64Image(url?: string): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith('data:image/')) return url;
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.warn('[PDF Exporter] Could not load signature image:', e);
    return null;
  }
}

/**
 * Main export function for official STI Form AP-01 Activity Proposal
 */
export async function exportActivityProposalPDF(
  proposal: Partial<ActivityProposal>,
  _options: ExportProposalPdfOptions = {}
): Promise<jsPDF> {
  try {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = 210;
    const pageHeight = 297;
    const marginL = 18;
    const marginR = 18;
    const marginT = 14;
    const marginB = 14;
    const contentW = pageWidth - marginL - marginR; // 174mm
    const colLabelW = 36; // Left label column width in mm
    const colContentW = contentW - colLabelW; // 138mm
    const xLabel = marginL; // 18mm
    const xContent = marginL + colLabelW; // 54mm
    const xRight = marginL + contentW; // 192mm
    const maxPageY = pageHeight - marginB; // 283mm

    let y = marginT;

    // Formatting date
    const submissionDate =
      proposal.submissionDate ||
      new Intl.DateTimeFormat('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }).format(new Date());

    const referenceNo = proposal.referenceNo || 'AP-2026-PENDING';

    // Page Break Helper: ensures space or creates new page
    const ensureSpace = (neededHeight: number): void => {
      if (y + neededHeight > maxPageY) {
        doc.addPage();
        y = marginT;
      }
    };

    // ─── 1. TOP HEADER (LOGO + DATE) ─────────────────────────────────────────
    // Official STI Logo (38.9mm x 10.7mm)
    try {
      doc.addImage(STI_LOGO_BASE64, 'JPEG', marginL, y, 38.9, 10.7);
    } catch (e) {
      console.warn('Could not add STI logo:', e);
    }

    // Right-aligned Date with underline (matching Table 0 of AP_FORMAT_EMPTY.docx)
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(0, 0, 0);

    const dateLineWidth = 54;
    const dateLineX = xRight - dateLineWidth;
    doc.text('Date:', dateLineX - 10, y + 6.5);
    doc.text(submissionDate, dateLineX + 2, y + 6.5);

    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.2);
    doc.line(dateLineX, y + 7.8, xRight, y + 7.8);

    y += 16;

    // ─── 2. TITLE: "Activity Proposal" (CENTERED MATCHING REFERENCE) ────────
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.text('Activity Proposal', pageWidth / 2, y, { align: 'center' });

    y += 5.5;

    // ─── 3. STANDARD FORM FIELD RENDERER (MATCHING AP_FORMAT_EMPTY.DOCX) ────
    /**
     * Renders an authentic STI field row:
     * - Left column: Bold label (NO BOX BORDER)
     * - Right column: Content lines + horizontal bottom underline line
     * - Bullet support with hanging indent for Objective/s, Success indicator/s, Mechanics
     */
    const renderField = (
      label: string,
      contentInput: string | string[],
      options: {
        boldContent?: boolean;
        skipUnderline?: boolean;
        isBullets?: boolean;
        prompt?: string;
      } = {}
    ): void => {
      const labelLines = doc.splitTextToSize(label, colLabelW - 3);

      if (options.isBullets) {
        const rawLines = toLines(contentInput);
        const bulletItems = rawLines
          .map((s) => s.replace(/^[\s•\-\*▪]+|^(\d+[\.\)]|\(\d+\))\s+/, '').trim())
          .filter(Boolean);

        const promptHeight = options.prompt ? 4.5 : 0;
        let totalItemsHeight = 0;
        const itemLineArrays: string[][] = [];

        if (bulletItems.length === 0) {
          totalItemsHeight = 5.5;
        } else if (bulletItems.length === 1 && bulletItems[0].toLowerCase() === 'none') {
          totalItemsHeight = 5.5;
        } else {
          for (const item of bulletItems) {
            const lines = doc.splitTextToSize(item, colContentW - 8);
            itemLineArrays.push(lines);
            totalItemsHeight += lines.length * 3.4 + 1.2;
          }
        }

        const labelH = labelLines.length * 3.8;
        const totalFieldH = Math.max(6.0, labelH + 2.0, promptHeight + totalItemsHeight + 2.5);
        ensureSpace(Math.min(25, totalFieldH));

        // Draw left label
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(0, 0, 0);
        doc.text(labelLines, xLabel, y + 3.2);

        // Draw prompt if present
        if (options.prompt) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(0, 0, 0);
          doc.text(options.prompt, xContent, y + 3.2);
          y += promptHeight;
        }

        if (bulletItems.length === 0) {
          y += 5.5;
        } else if (bulletItems.length === 1 && bulletItems[0].toLowerCase() === 'none') {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.5);
          doc.setTextColor(0, 0, 0);
          doc.text('None', xContent, y + 3.2);
          y += 5.5;
        } else {
          for (let i = 0; i < bulletItems.length; i++) {
            const lines = itemLineArrays[i];
            const itemH = lines.length * 3.4 + 1.2;
            if (y + itemH > maxPageY) {
              doc.addPage();
              y = marginT;
            }

            // Solid circular bullet point
            doc.setFillColor(0, 0, 0);
            doc.circle(xContent + 2.5, y + 2.2, 0.65, 'F');

            // Bullet text with hanging indent
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8.5);
            doc.setTextColor(0, 0, 0);
            doc.text(lines, xContent + 5.5, y + 3.0);

            y += itemH;
          }
        }

        // Horizontal bottom underline
        if (!options.skipUnderline) {
          doc.setDrawColor(0, 0, 0);
          doc.setLineWidth(0.2);
          doc.line(xContent, y + 1.0, xRight, y + 1.0);
        }
        y += 3.0;
        return;
      }

      // Regular non-bullet field
      const linesArray = Array.isArray(contentInput)
        ? contentInput.flatMap((str) => doc.splitTextToSize(str, colContentW - 2))
        : doc.splitTextToSize(contentInput || '', colContentW - 2);

      const lineHeight = 3.8;
      const contentTextH = Math.max(1, linesArray.length) * lineHeight;
      const rowH = Math.max(5.5, contentTextH + 2.5);

      ensureSpace(rowH);

      // Left Column: Bold Label (NO BOX BORDER)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(0, 0, 0);
      doc.text(labelLines, xLabel, y + 3.2);

      // Right Column: Content
      doc.setFont('helvetica', options.boldContent ? 'bold' : 'normal');
      doc.setFontSize(9);
      doc.setTextColor(0, 0, 0);
      if (linesArray.length > 0) {
        doc.text(linesArray, xContent, y + 3.2);
      }

      // Horizontal Underline under the right column (matching AP_FORMAT_EMPTY)
      const lineY = y + contentTextH + 1.0;
      if (!options.skipUnderline) {
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.2);
        doc.line(xContent, lineY, xRight, lineY);
      }

      y = lineY + 2.5; // Spacing before next row
    };

    // ─── 4. BASIC INFORMATION ROWS (ROWS 1 TO 13) ───────────────────────────
    // Row 1: Activity title
    renderField('Activity title:', proposal.title || '', { boldContent: true });

    // Row 2: Description
    renderField('Description:', proposal.description || '');

    // Row 3: Organizer/s
    const organizersList = proposal.organizers && proposal.organizers.length > 0
      ? proposal.organizers.join(', ')
      : proposal.createdByName || 'Student Affairs & Services';
    renderField('Organizer/s:', organizersList);

    // Row 4: Objective/s (each item 1 line with bullet)
    renderField('Objective/s:', proposal.objectives || '', { isBullets: true });

    // Row 5: Success indicator/s (each item 1 line with bullet)
    renderField('Success indicator/s:', proposal.successIndicators || '', { isBullets: true });

    // Row 6: Mechanics (with prompt; each item 1 line with bullet)
    const mechanicsPrompt = '(List the mechanics and/or procedures in detail. Attach sheets, if necessary.)';
    renderField('Mechanics:', proposal.mechanics || '', { isBullets: true, prompt: mechanicsPrompt });

    // Row 7: Materials (each item 1 line with bullet)
    renderField('Materials:', proposal.materials || '', { isBullets: true });

    // Row 8: Target market
    renderField('Target market:', formatTargetMarket(proposal.targetAudience));

    // Row 9: Est. attendance
    const estAtt = proposal.estimatedAttendance || (proposal.estAttendanceCount ? `${proposal.estAttendanceCount} ${proposal.estAttendanceQualifier || 'Participants'}` : '');
    renderField('Est. attendance:', estAtt);

    // Row 10: Marketing plan (each item 1 line with bullet)
    renderField('Marketing plan:', proposal.marketingPlan || '', { isBullets: true });

    // Row 11: Documentation (each item 1 line with bullet)
    renderField('Documentation:', proposal.documentationPlan || '', { isBullets: true });

    // Row 12: Date & time
    renderField('Date & time:', formatDateAndTime(proposal));

    // Row 13: Venue
    const venueStr = proposal.customVenueName || proposal.venueName || (proposal.sessions?.[0]?.venueName) || 'STI College Ormoc';
    renderField('Venue:', venueStr);

    // ─── 5. ROW 14: TASK LIST (TABLE 2 WITH FULL GRID BORDERS) ─────────────
    ensureSpace(32);

    // Left Label (NO BORDER)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.text('Task list:', xLabel, y + 3.2);

    // Prompt
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(0, 0, 0);
    doc.text('(List all involved tasks chronologically. Attach sheets, if necessary.)', xContent, y + 3.2);
    y += 5.5;

    // Table 2 Columns (Total = 138mm)
    const colTaskW = 58;
    const colPersonW = 46;
    const colDateW = 34;

    const drawTaskHeader = (): void => {
      const headerH = 7.0;
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.25);
      // Explicit cell box borders for each column
      doc.rect(xContent, y, colTaskW, headerH);
      doc.rect(xContent + colTaskW, y, colPersonW, headerH);
      doc.rect(xContent + colTaskW + colPersonW, y, colDateW, headerH);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(0, 0, 0);
      doc.text('Task', xContent + colTaskW / 2, y + 4.5, { align: 'center' });
      doc.text('Person Assigned', xContent + colTaskW + colPersonW / 2, y + 4.5, { align: 'center' });
      doc.text('Date to be Completed', xContent + colTaskW + colPersonW + colDateW / 2, y + 4.5, { align: 'center' });
      y += headerH;
    };

    drawTaskHeader();

    const tasks = proposal.tasks && proposal.tasks.length > 0 ? proposal.tasks : [];

    if (tasks.length === 0) {
      // Draw 6 empty bordered rows matching AP_FORMAT_EMPTY.docx
      const emptyRowH = 6.0;
      for (let i = 0; i < 6; i++) {
        ensureSpace(emptyRowH);
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.25);
        doc.rect(xContent, y, colTaskW, emptyRowH);
        doc.rect(xContent + colTaskW, y, colPersonW, emptyRowH);
        doc.rect(xContent + colTaskW + colPersonW, y, colDateW, emptyRowH);
        y += emptyRowH;
      }
    } else {
      tasks.forEach((t) => {
        const taskName = (t.taskName || '').trim();
        const person = (t.assignedPerson || '').trim();
        const date = (t.completionDate || '').trim();

        const tLines = doc.splitTextToSize(taskName || '—', colTaskW - 4);
        const pLines = doc.splitTextToSize(person || '—', colPersonW - 4);
        const dLines = doc.splitTextToSize(date || '—', colDateW - 4);

        const maxLines = Math.max(1, tLines.length, pLines.length, dLines.length);
        const rowH = Math.max(6.0, maxLines * 3.4 + 2.4);

        if (y + rowH > maxPageY) {
          doc.addPage();
          y = marginT;
          drawTaskHeader();
        }

        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.25);
        doc.rect(xContent, y, colTaskW, rowH);
        doc.rect(xContent + colTaskW, y, colPersonW, rowH);
        doc.rect(xContent + colTaskW + colPersonW, y, colDateW, rowH);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(0, 0, 0);
        doc.text(tLines, xContent + 2, y + 3.8);
        doc.text(pLines, xContent + colTaskW + 2, y + 3.8);
        doc.text(dLines, xContent + colTaskW + colPersonW + 2, y + 3.8);

        y += rowH;
      });

      // Pad up to 4 rows if tasks count is fewer than 4
      if (tasks.length < 4) {
        const remaining = 4 - tasks.length;
        const emptyRowH = 6.0;
        for (let i = 0; i < remaining; i++) {
          ensureSpace(emptyRowH);
          doc.setDrawColor(0, 0, 0);
          doc.setLineWidth(0.25);
          doc.rect(xContent, y, colTaskW, emptyRowH);
          doc.rect(xContent + colTaskW, y, colPersonW, emptyRowH);
          doc.rect(xContent + colTaskW + colPersonW, y, colDateW, emptyRowH);
          y += emptyRowH;
        }
      }
    }

    y += 4.0; // Spacing after task table

    // ─── 6. ROW 15: FINANCIAL PROJECTIONS (TABLE 3 WITH FULL GRID BORDERS) ──
    const fin = proposal.financialProjections || {
      revenues: [],
      expenses: [],
      totalRevenue: 0,
      totalExpenses: 0,
      balance: 0,
    };

    const finRowCount = Math.max(3, (fin.revenues?.length || 0) + (fin.expenses?.length || 0));
    const estimatedFinH = 12.0 + 10.5 + (finRowCount * 6.5) + 5.5 + 5.5 + 6.0; // ~60-70mm
    if (estimatedFinH < 220 && (y + estimatedFinH > maxPageY)) {
      doc.addPage();
      y = marginT;
    } else {
      ensureSpace(38);
    }

    // Left Label (NO BORDER)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.text('Financial projections:', xLabel, y + 3.2);

    // Prompt
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(0, 0, 0);
    doc.text('(Anticipate all possible costs for an accurate budget proposal.)', xContent, y + 3.2);
    y += 5.5;

    // 6 Columns width matching Table 3 (Total = 138mm)
    const fDescW = 48;
    const fLastW = 18;
    const fThisW = 18;
    const fTotW = 20;
    const fAdjW = 17;
    const fRemW = 17;

    const xDesc = xContent;
    const xLast = xDesc + fDescW;
    const xThis = xLast + fLastW;
    const xTot = xThis + fThisW;
    const xAdj = xTot + fTotW;
    const xRem = xAdj + fAdjW;

    const drawFinHeader = (): void => {
      const headerH = 10.5;
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.25);

      // 6 bordered cell boxes
      doc.rect(xDesc, y, fDescW, headerH);
      doc.rect(xLast, y, fLastW, headerH);
      doc.rect(xThis, y, fThisW, headerH);
      doc.rect(xTot, y, fTotW, headerH);
      doc.rect(xAdj, y, fAdjW, headerH);
      doc.rect(xRem, y, fRemW, headerH);

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);

      // Description
      doc.setFontSize(7.5);
      doc.text('Description', xDesc + fDescW / 2, y + 6.0, { align: 'center' });

      // LAST YEAR ACTUAL BUDGET (3 lines)
      doc.setFontSize(6);
      doc.text('LAST YEAR', xLast + fLastW / 2, y + 3.2, { align: 'center' });
      doc.text('ACTUAL', xLast + fLastW / 2, y + 5.8, { align: 'center' });
      doc.text('BUDGET', xLast + fLastW / 2, y + 8.4, { align: 'center' });

      // THIS YEAR PROPOSED BUDGET (3 lines)
      doc.text('THIS YEAR', xThis + fThisW / 2, y + 3.2, { align: 'center' });
      doc.text('PROPOSED', xThis + fThisW / 2, y + 5.8, { align: 'center' });
      doc.text('BUDGET', xThis + fThisW / 2, y + 8.4, { align: 'center' });

      // Total Amount
      doc.setFontSize(6.5);
      doc.text('Total Amount', xTot + fTotW / 2, y + 6.0, { align: 'center' });

      // ADJUSTMENT
      doc.setFontSize(6);
      doc.text('ADJUSTMENT', xAdj + fAdjW / 2, y + 6.0, { align: 'center' });

      // REMARKS
      doc.setFontSize(6.5);
      doc.text('REMARKS', xRem + fRemW / 2, y + 6.0, { align: 'center' });

      y += headerH;
    };

    drawFinHeader();

    // A. Revenue Items (if any)
    if (fin.revenues && fin.revenues.length > 0) {
      fin.revenues.forEach((rev) => {
        const descText = rev.description || 'Revenue source';
        const descLines = doc.splitTextToSize(descText, fDescW - 3);
        const remLines = doc.splitTextToSize(rev.remarks || '', fRemW - 3);
        const maxLines = Math.max(1, descLines.length, remLines.length);
        const rowH = Math.max(5.5, maxLines * 3.2 + 2.2);

        if (y + rowH > maxPageY) {
          doc.addPage();
          y = marginT;
          drawFinHeader();
        }

        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.25);
        doc.rect(xDesc, y, fDescW, rowH);
        doc.rect(xLast, y, fLastW, rowH);
        doc.rect(xThis, y, fThisW, rowH);
        doc.rect(xTot, y, fTotW, rowH);
        doc.rect(xAdj, y, fAdjW, rowH);
        doc.rect(xRem, y, fRemW, rowH);

        doc.setFont('helvetica', descText.toLowerCase().startsWith('revenue') ? 'bold' : 'normal');
        doc.setFontSize(7);
        doc.setTextColor(0, 0, 0);
        doc.text(descLines, xDesc + 1.5, y + 3.5);

        doc.setFont('helvetica', 'normal');
        if (rev.lastYearActual) {
          doc.text(formatPdfAmount(rev.lastYearActual), xLast + fLastW - 1.5, y + 3.5, { align: 'right' });
        }
        if (rev.thisYearProposed) {
          doc.text(formatPdfAmount(rev.thisYearProposed), xThis + fThisW - 1.5, y + 3.5, { align: 'right' });
        }
        if (rev.totalAmount) {
          doc.text(formatPdfAmount(rev.totalAmount), xTot + fTotW - 1.5, y + 3.5, { align: 'right' });
        }
        if (rev.adjustment) {
          doc.text(formatPdfAmount(rev.adjustment), xAdj + fAdjW - 1.5, y + 3.5, { align: 'right' });
        }
        if (remLines.length > 0) {
          doc.text(remLines, xRem + 1.5, y + 3.5);
        }

        y += rowH;
      });
    }

    // B. Expense Items
    const expenses = fin.expenses && fin.expenses.length > 0 ? fin.expenses : [];
    if (expenses.length === 0 && (!fin.revenues || fin.revenues.length === 0)) {
      // 6 empty bordered rows matching AP_FORMAT_EMPTY.docx
      const emptyRowH = 5.5;
      for (let i = 0; i < 6; i++) {
        ensureSpace(emptyRowH);
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.25);
        doc.rect(xDesc, y, fDescW, emptyRowH);
        doc.rect(xLast, y, fLastW, emptyRowH);
        doc.rect(xThis, y, fThisW, emptyRowH);
        doc.rect(xTot, y, fTotW, emptyRowH);
        doc.rect(xAdj, y, fAdjW, emptyRowH);
        doc.rect(xRem, y, fRemW, emptyRowH);
        y += emptyRowH;
      }
    } else {
      expenses.forEach((exp) => {
        const descText = exp.description || 'Expense item';
        const descLines = doc.splitTextToSize(descText, fDescW - 3);
        const remLines = doc.splitTextToSize(exp.remarks || '', fRemW - 3);
        const maxLines = Math.max(1, descLines.length, remLines.length);
        const rowH = Math.max(5.5, maxLines * 3.2 + 2.2);

        if (y + rowH > maxPageY) {
          doc.addPage();
          y = marginT;
          drawFinHeader();
        }

        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.25);
        doc.rect(xDesc, y, fDescW, rowH);
        doc.rect(xLast, y, fLastW, rowH);
        doc.rect(xThis, y, fThisW, rowH);
        doc.rect(xTot, y, fTotW, rowH);
        doc.rect(xAdj, y, fAdjW, rowH);
        doc.rect(xRem, y, fRemW, rowH);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(0, 0, 0);
        doc.text(descLines, xDesc + 1.5, y + 3.5);

        // Amounts (right-aligned inside each cell box)
        if (exp.lastYearActual !== undefined && exp.lastYearActual !== null) {
          doc.text(formatPdfAmount(exp.lastYearActual), xLast + fLastW - 1.5, y + 3.5, { align: 'right' });
        }
        if (exp.thisYearProposed !== undefined && exp.thisYearProposed !== null) {
          doc.text(formatPdfAmount(exp.thisYearProposed), xThis + fThisW - 1.5, y + 3.5, { align: 'right' });
        }
        if (exp.totalAmount !== undefined && exp.totalAmount !== null) {
          doc.text(formatPdfAmount(exp.totalAmount), xTot + fTotW - 1.5, y + 3.5, { align: 'right' });
        }
        if (exp.adjustment !== undefined && exp.adjustment !== null) {
          doc.text(formatPdfAmount(exp.adjustment), xAdj + fAdjW - 1.5, y + 3.5, { align: 'right' });
        }
        if (remLines.length > 0) {
          doc.text(remLines, xRem + 1.5, y + 3.5);
        }

        y += rowH;
      });

      // Pad up to 3 expense rows if fewer than 3
      if (expenses.length < 3) {
        const remaining = 3 - expenses.length;
        const emptyRowH = 5.5;
        for (let i = 0; i < remaining; i++) {
          ensureSpace(emptyRowH);
          doc.setDrawColor(0, 0, 0);
          doc.setLineWidth(0.25);
          doc.rect(xDesc, y, fDescW, emptyRowH);
          doc.rect(xLast, y, fLastW, emptyRowH);
          doc.rect(xThis, y, fThisW, emptyRowH);
          doc.rect(xTot, y, fTotW, emptyRowH);
          doc.rect(xAdj, y, fAdjW, emptyRowH);
          doc.rect(xRem, y, fRemW, emptyRowH);
          y += emptyRowH;
        }
      }
    }

    // C. Total Expenses & Balance Rows (kept together)
    ensureSpace(16);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.25);
    doc.rect(xDesc, y, fDescW, 5.5);
    doc.rect(xLast, y, fLastW, 5.5);
    doc.rect(xThis, y, fThisW, 5.5);
    doc.rect(xTot, y, fTotW, 5.5);
    doc.rect(xAdj, y, fAdjW, 5.5);
    doc.rect(xRem, y, fRemW, 5.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(0, 0, 0);
    doc.text('Total Expenses:', xDesc + 1.5, y + 3.8);
    doc.text(formatPdfAmount(fin.totalExpenses), xTot + fTotW - 1.5, y + 3.8, { align: 'right' });
    y += 5.5;

    // D. Balance (Revenue less Expenses) Row
    const balanceMergedW = fDescW + fLastW + fThisW; // 84mm
    doc.rect(xDesc, y, balanceMergedW, 5.5);
    doc.rect(xTot, y, fTotW, 5.5);
    doc.rect(xAdj, y, fAdjW, 5.5);
    doc.rect(xRem, y, fRemW, 5.5);

    const balanceSign = fin.balance < 0 ? '-' : '';
    const absBalance = Math.abs(fin.balance || 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(0, 0, 0);
    doc.text(
      `Balance (Revenue less Expenses):  P ${balanceSign}${formatPdfAmount(absBalance)}`,
      xDesc + 1.5,
      y + 3.8
    );
    y += 5.5;

    y += 4.0; // Spacing after financial projections table

    // ─── 7. SIGNATORY BLOCKS (MATCHING AP_FORMAT_EMPTY.DOCX) ────────────────
    const chain: ProposalApprovalStep[] = proposal.approvalChain || [];
    const endorsers = chain.filter((s) => s.actionType !== 'approve' && s.role !== 'school_president');
    const approvers = chain.filter((s) => s.actionType === 'approve' || s.role === 'school_president');

    // Default Proponents list
    const proponentsList =
      proposal.proponents && proposal.proponents.length > 0
        ? proposal.proponents
        : [proposal.createdByName ? `${proposal.createdByName} – ${proposal.creatorRole === 'sas_admin' ? 'Student Affairs Officer' : 'Activity Proponent'}` : 'Student Affairs & Services'];

    // Default Endorsers list if none configured yet
    const defaultEndorsers = [
      { name: 'Humabona L. Gonzales', roleTitle: 'Academic Head', signatureUrl: undefined, status: 'waiting' },
      { name: 'Engr. Sheena Joy S. Muyuela', roleTitle: 'School Administrator', signatureUrl: undefined, status: 'waiting' },
    ];

    // Default Approver if none configured yet
    const defaultApprover = {
      name: 'Atty. Antonio R. Lucero Jr.',
      roleTitle: 'School President',
      signatureUrl: undefined,
      status: 'waiting',
    };

    /**
     * Helper to render authentic STI signature line with digital ink signature image
     * Arranged in a 2-column grid to fit any number of signatories cleanly
     */
    const renderSignatories = async (
      label: string,
      signatories: { name: string; roleTitle: string; signatureUrl?: string; status?: string }[]
    ): Promise<void> => {
      if (signatories.length === 0) return;

      const numRows = Math.ceil(signatories.length / 2);
      const rowBlockH = 20.0;
      const totalBlockH = numRows * rowBlockH;

      ensureSpace(totalBlockH + 4);

      // Label on left (bold, NO BOX BORDER)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(0, 0, 0);
      doc.text(label, xLabel, y + 3.2);

      const slotW = (colContentW - 6) / 2; // ~66mm
      const lineLen = Math.min(60, slotW - 4);

      for (let i = 0; i < signatories.length; i++) {
        const sig = signatories[i];
        const colIdx = i % 2;
        const rowIdx = Math.floor(i / 2);

        const slotX = xContent + colIdx * (slotW + 6);
        const currentLineY = y + rowIdx * rowBlockH + 9.0;

        // Render digital signature image above underline if signed
        if (sig.signatureUrl && (sig.status === 'endorsed' || sig.status === 'approved')) {
          const sigB64 = await getBase64Image(sig.signatureUrl);
          if (sigB64) {
            try {
              doc.addImage(sigB64, 'PNG', slotX + 4, currentLineY - 9.5, 30, 9.0);
            } catch (e) {
              console.warn('Could not draw signature image:', e);
            }
          }
        }

        // Horizontal signature line (underline matching AP_FORMAT_EMPTY)
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.2);
        doc.line(slotX, currentLineY, slotX + lineLen, currentLineY);

        // Name (Bold)
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(0, 0, 0);
        doc.text(sig.name, slotX, currentLineY + 3.8);

        // Role Title (Normal)
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(0, 0, 0);
        doc.text(sig.roleTitle, slotX, currentLineY + 7.2);
      }

      y += totalBlockH + 2.0;
    };

    // A. Proposed by:
    const parsedProponents = proponentsList.map((p) => {
      const parts = p.split('–').map((s) => s.trim());
      return {
        name: parts[0] || p,
        roleTitle: parts[1] || 'Activity Proponent',
        signatureUrl: undefined,
        status: 'approved',
      };
    });
    await renderSignatories('Proposed by:', parsedProponents);

    // B. Endorsed by:
    const endorsersList = endorsers.length > 0
      ? endorsers.map((e) => ({
          name: e.signatoryName || 'Designated Endorser',
          roleTitle: e.roleTitle || 'Institutional Officer',
          signatureUrl: e.signatureUrl,
          status: e.status,
        }))
      : defaultEndorsers;
    await renderSignatories('Endorsed by:', endorsersList);

    // C. Approved by:
    const approverList = approvers.length > 0
      ? approvers.map((a) => ({
          name: a.signatoryName || 'School President',
          roleTitle: a.roleTitle || 'School President',
          signatureUrl: a.signatureUrl,
          status: a.status,
        }))
      : [defaultApprover];
    await renderSignatories('Approved by:', approverList);

    // ─── 8. MANDATORY STI POLICY FOOTNOTE ─────────────────────────────────────
    y += 2.0;
    ensureSpace(8);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(0, 0, 0);
    doc.text(
      'Note: This proposal must be submitted to the Administrator at least 15 calendar days before the start of the initial task.',
      marginL,
      y
    );

    // ─── 9. SAVE PDF FILE ────────────────────────────────────────────────────
    const cleanFileName = `STI_Activity_Proposal_${referenceNo.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
    if (typeof window !== 'undefined' && doc.save) {
      doc.save(cleanFileName);
    }
    return doc;
  } catch (error) {
    console.error('[PDF Exporter] Error exporting Activity Proposal PDF:', error);
    throw error;
  }
}
