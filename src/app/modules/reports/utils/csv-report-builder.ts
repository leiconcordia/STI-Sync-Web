import { toast } from 'sonner';
import { GeneratedReportData } from '../types/report.types';

/**
 * Generates and downloads a UTF-8 BOM CSV file from a GeneratedReportData object.
 * Sanitizes embedded newlines and double quotes so columns never shift or overlap in Excel.
 */
export function exportReportToCSV(report: GeneratedReportData) {
  try {
    const escapeCSV = (val: string | number | undefined | null) => {
      if (val === undefined || val === null) return '""';
      const cleaned = String(val)
        .replace(/\r?\n|\r/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/"/g, '""');
      return `"${cleaned}"`;
    };

    const headers = report.columns.map((c) => escapeCSV(c.header));
    const rows = (report.rows || []).map((row) =>
      report.columns.map((c) => escapeCSV(row[c.key]))
    );

    const metadataHeaders = [
      `"STI COLLEGE ORMOC - STUDENT AFFAIRS AND SERVICES (SAS)"`,
      `"${report.title.toUpperCase().replace(/"/g, '""')}"`,
      `"Scope: ${report.metadata.scope} | Term: ${report.metadata.academicYear || 'All Years'} ${report.metadata.semester || 'All Semesters'}"`,
      `"Generated At: ${report.metadata.generatedAt} by ${report.metadata.generatedBy}"`,
      `""`,
    ];

    const csvLines = [
      ...metadataHeaders,
      headers.join(','),
      ...rows.map((r) => r.join(',')),
    ];

    if (rows.length === 0) {
      csvLines.push(`"No matching records found for the selected filter criteria."`);
      toast.info('Exported CSV template (0 rows matched current filters).');
    } else {
      toast.success(`Exported ${rows.length} record(s) to CSV.`);
    }

    // Prepend UTF-8 BOM (\uFEFF) so Microsoft Excel renders ₱ and special characters properly
    const csvContent = '\uFEFF' + csvLines.join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const cleanTitle = report.title.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
    const dateStr = new Date().toISOString().split('T')[0];
    link.setAttribute('href', url);
    link.setAttribute('download', `${cleanTitle}_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('[exportReportToCSV] Failed to export CSV:', err);
    toast.error('Failed to generate CSV file.');
  }
}
