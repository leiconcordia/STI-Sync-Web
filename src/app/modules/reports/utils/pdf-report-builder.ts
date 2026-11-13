import jsPDF from 'jspdf';
import { toast } from 'sonner';
import { GeneratedReportData, ReportTableColumn } from '../types/report.types';

/**
 * Computes proportional column widths (in mm) based on column keys/headers
 * so wide text columns (titles, organizations, advisers) get more room than narrow ID/status columns.
 */
function computeColumnWidths(columns: ReportTableColumn[], totalWidth: number): number[] {
  const weights = columns.map((col) => {
    const key = col.key.toLowerCase();
    const hdr = col.header.toLowerCase();
    if (key.includes('title') || key.includes('activityname') || key.includes('eventtitle') || hdr.includes('title')) return 2.4;
    if (key.includes('organization') || key.includes('organizer') || key.includes('name') || key.includes('assignedclubs')) return 1.9;
    if (key.includes('adviser') || key.includes('president') || key.includes('venue') || key.includes('email')) return 1.6;
    if (key.includes('ref') || key.includes('code') || key.includes('id') || key.includes('status') || key.includes('stage')) return 1.15;
    return 1.25;
  });

  const sumWeights = weights.reduce((a, b) => a + b, 0) || 1;
  return weights.map((w) => (w / sumWeights) * totalWidth);
}

/**
 * Builds and downloads an Official STI Formatted PDF report with letterhead,
 * executive summary KPIs, multi-line wrapped non-overlapping data table, and signature sign-off blocks.
 */
export async function exportReportToPDF(report: GeneratedReportData) {
  try {
    const isLandscape = report.columns.length > 4;
    const doc = new jsPDF({
      orientation: isLandscape ? 'landscape' : 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = isLandscape ? 297 : 210;
    const pageHeight = isLandscape ? 210 : 297;
    const margin = 12;
    const tableWidth = pageWidth - margin * 2;
    let y = margin;

    // ─── 1. Header Banner (Dark Navy) ──────────────────────────────────────────
    doc.setFillColor(0, 26, 77); // #001A4D
    doc.rect(margin, y, tableWidth, 24, 'F');

    // STI Yellow accent strip
    doc.setFillColor(255, 212, 28); // #FFD41C
    doc.rect(margin, y + 24, tableWidth, 1.8, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(255, 255, 255);
    doc.text('STI COLLEGE ORMOC', margin + 5, y + 8.5);

    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(255, 212, 28);
    doc.text('STUDENT AFFAIRS AND SERVICES (SAS) · OFFICIAL SYSTEM REPORT', margin + 5, y + 14.5);

    doc.setFontSize(7.5);
    doc.setTextColor(200, 215, 245);
    doc.text(
      `Academic Period: ${report.metadata.academicYear || 'All Years'} · ${report.metadata.semester || 'All Semesters'} | Track: ${report.metadata.scope}`,
      margin + 5,
      y + 20.5
    );

    doc.setFontSize(7.5);
    doc.setTextColor(230, 230, 230);
    doc.text(`Generated: ${report.metadata.generatedAt}`, pageWidth - margin - 5, y + 9.5, { align: 'right' });
    doc.text(`Issuer: ${report.metadata.generatedBy}`, pageWidth - margin - 5, y + 15.5, { align: 'right' });

    y += 31;

    // ─── 2. Report Title & Subtitle ──────────────────────────────────────────
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(0, 26, 77);
    doc.text(report.title.toUpperCase(), margin, y);
    y += 4.5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(95, 105, 120);
    const subLines = doc.splitTextToSize(report.metadata.subtitle || '', tableWidth);
    doc.text(subLines, margin, y);
    y += subLines.length * 4 + 3;

    // ─── 3. Executive KPI Summary Cards ──────────────────────────────────────
    if (report.kpis && report.kpis.length > 0) {
      const kpiGap = 2.5;
      const cardWidth = (tableWidth - (report.kpis.length - 1) * kpiGap) / report.kpis.length;
      report.kpis.forEach((kpi, i) => {
        const x = margin + i * (cardWidth + kpiGap);
        doc.setFillColor(245, 248, 255);
        doc.setDrawColor(210, 225, 250);
        doc.roundedRect(x, y, cardWidth, 13, 1.8, 1.8, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(100, 115, 140);
        const lbl = doc.splitTextToSize(kpi.label.toUpperCase(), cardWidth - 4)[0] || kpi.label;
        doc.text(lbl, x + 2.5, y + 4.5);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(0, 26, 77);
        const valStr = doc.splitTextToSize(String(kpi.value).replace(/₱/g, 'PHP '), cardWidth - 4)[0] || String(kpi.value);
        doc.text(valStr, x + 2.5, y + 10.2);
      });
      y += 16.5;
    }

    // ─── 4. Table Header Helper ──────────────────────────────────────────────
    const colWidths = computeColumnWidths(report.columns, tableWidth);

    const drawTableHeader = (startY: number): number => {
      const headerHeight = 7.5;
      doc.setFillColor(0, 26, 77);
      doc.rect(margin, startY, tableWidth, headerHeight, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(255, 255, 255);

      let curX = margin;
      report.columns.forEach((col, i) => {
        const w = colWidths[i];
        const headerText = doc.splitTextToSize(col.header.toUpperCase(), w - 3)[0] || col.header.toUpperCase();
        doc.text(headerText, curX + 1.5, startY + 5);
        curX += w;
      });

      return startY + headerHeight;
    };

    y = drawTableHeader(y);

    // ─── 5. Wrapped Multi-Page Table Rows (Zero Overlap, Full Dataset) ───────
    const lineHeight = 3.4;
    const rows = report.rows || [];

    if (rows.length === 0) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      doc.rect(margin, y, tableWidth, 8, 'S');
      doc.text('No matching records found for the selected filter criteria.', margin + 4, y + 5.2);
      y += 10;
    } else {
      rows.forEach((row, rowIndex) => {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);

        // Pre-split cell lines so we know exact row height before drawing
        const wrappedCells: string[][] = report.columns.map((col, i) => {
          const rawVal = row[col.key] !== undefined && row[col.key] !== null && String(row[col.key]).trim() !== ''
            ? String(row[col.key]).replace(/₱/g, 'PHP ')
            : '—';
          const lines = doc.splitTextToSize(rawVal, Math.max(10, colWidths[i] - 3));
          return lines.slice(0, 3); // cap at 3 wrapped lines per cell for clean vertical rhythm
        });

        const maxLines = Math.max(1, ...wrappedCells.map((lines) => lines.length));
        const rowHeight = Math.max(6, maxLines * lineHeight + 2.4);

        // Page break if row would collide with footer margin
        if (y + rowHeight > pageHeight - 16) {
          doc.addPage();
          y = margin;
          y = drawTableHeader(y);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7);
        }

        // Alternating row background
        if (rowIndex % 2 === 1) {
          doc.setFillColor(248, 250, 252);
          doc.rect(margin, y, tableWidth, rowHeight, 'F');
        }

        // Cell text & subtle vertical/horizontal grid borders
        doc.setDrawColor(228, 233, 242);
        doc.setLineWidth(0.15);
        doc.rect(margin, y, tableWidth, rowHeight, 'S');

        doc.setTextColor(35, 42, 55);
        let curX = margin;
        wrappedCells.forEach((lines, i) => {
          const w = colWidths[i];
          if (i > 0) {
            doc.line(curX, y, curX, y + rowHeight);
          }
          lines.forEach((lineStr, lineIdx) => {
            doc.text(lineStr, curX + 1.5, y + 3.8 + lineIdx * lineHeight);
          });
          curX += w;
        });

        y += rowHeight;
      });
    }

    // ─── 6. Official Signature Sign-off Block ────────────────────────────────
    const sigBlockHeight = 24;
    if (y + sigBlockHeight > pageHeight - 12) {
      doc.addPage();
      y = margin + 6;
    } else {
      y += 8;
    }

    const signY = y;
    const signWidth = tableWidth / 3;

    // Prepared By
    const prepName = report.signatories?.preparedBy?.name || report.metadata.generatedBy;
    const prepTitle = report.signatories?.preparedBy?.title || 'SAS Administrator';
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(0, 26, 77);
    doc.text('Prepared by:', margin, signY);
    doc.setDrawColor(100, 115, 140);
    doc.line(margin, signY + 10, margin + signWidth - 10, signY + 10);
    doc.text(prepName, margin, signY + 14);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(105, 115, 130);
    doc.text(prepTitle, margin, signY + 17.5);

    // Attested By
    const attName = report.signatories?.attestedBy?.name || report.metadata.presidentName || 'SAS Coordinator';
    const attTitle = report.signatories?.attestedBy?.title || 'Student Affairs & Services';
    const attX = margin + signWidth;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(0, 26, 77);
    doc.text('Verified / Attested by:', attX, signY);
    doc.line(attX, signY + 10, attX + signWidth - 10, signY + 10);
    doc.text(attName, attX, signY + 14);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(105, 115, 130);
    doc.text(attTitle, attX, signY + 17.5);

    // Approved By
    const appName = report.signatories?.approvedBy?.name || report.metadata.adviserName || 'School Administrator';
    const appTitle = report.signatories?.approvedBy?.title || 'Campus Administrator / Academic Head';
    const appX = margin + signWidth * 2;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(0, 26, 77);
    doc.text('Approved by:', appX, signY);
    doc.line(appX, signY + 10, appX + signWidth - 10, signY + 10);
    doc.text(appName, appX, signY + 14);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(105, 115, 130);
    doc.text(appTitle, appX, signY + 17.5);

    // ─── 7. Page Numbers & Footer on Every Page ──────────────────────────────
    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(6.5);
      doc.setTextColor(135, 145, 160);
      doc.text(
        'STI Sync Official Institutional Report · Confidential & Proprietary to STI College Ormoc',
        margin,
        pageHeight - 4.5
      );
      doc.text(`Page ${p} of ${totalPages}`, pageWidth - margin, pageHeight - 4.5, { align: 'right' });
    }

    const cleanTitle = report.title.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
    const dateStr = new Date().toISOString().split('T')[0];
    doc.save(`${cleanTitle}_${dateStr}.pdf`);
    toast.success('Official PDF report generated and downloaded.');
  } catch (err) {
    console.error('[exportReportToPDF] Failed to export PDF report:', err);
    toast.error('Failed to generate PDF. Please try exporting as CSV.');
  }
}
