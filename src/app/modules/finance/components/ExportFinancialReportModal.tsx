import { useState, useMemo } from 'react';
import {
  X,
  Download,
  Calendar,
  Building2,
  Filter,
  DollarSign,
  Search,
  CheckCircle2,
  FileSpreadsheet,
  Printer,
  RotateCcw,
  Clock,
  ArrowUpRight,
  ArrowDownLeft,
  Layers,
} from 'lucide-react';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import { useSemesters } from '../../academic/hooks/useAcademicStream';
import { parseTimestampMillis } from '../hooks/useFinanceStream';
import type { OrgLedgerDocument } from '../types/finance.types';
import { formatCurrency } from '../../../utils/currency';
import { formatAppDate } from '../../../utils/date';

export function formatTransactionSource(source?: string | null): string {
  if (!source) return 'General';
  const customMap: Record<string, string> = {
    allocation: 'Club Budget Allocation',
    student_collection: 'Student Collections',
    student_refund: 'Student Refund',
    event_budget: 'Event Budget Outlay',
    liquidation_surplus: 'Liquidation Surplus Return',
    liquidation_deficit: 'Liquidation Reimbursement',
    manual_expense: 'Operational Expense',
    carry_over: 'Prior Term Carry-Over',
    sponsorship: 'Sponsorship & Donations',
    membership_due: 'Membership Due',
  };
  return customMap[source] || source.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

interface ExportFinancialReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  organizationId: string;
  organizationName: string;
  ledgerData: OrgLedgerDocument[];
  currentSemesterId?: string;
  officerName?: string;
}

export function ExportFinancialReportModal({
  isOpen,
  onClose,
  organizationId,
  organizationName,
  ledgerData,
  currentSemesterId = 'all',
  officerName = 'Student Officer',
}: ExportFinancialReportModalProps) {
  const { data: semesters = [] } = useSemesters();

  // Filter States
  const [selectedSemester, setSelectedSemester] = useState<string>(currentSemesterId || 'all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [selectedSource, setSelectedSource] = useState<string>('all');
  const [txType, setTxType] = useState<'all' | 'income' | 'expense'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // 1. Initial filter by Semester and Date Range
  const dateAndSemFiltered = useMemo(() => {
    return ledgerData.filter((item) => {
      // Semester Filter
      if (selectedSemester !== 'all') {
        if (item.semesterId && item.semesterId !== selectedSemester) {
          return false;
        }
      }

      // Date Range Filter
      const itemMillis = parseTimestampMillis(item.date) || parseTimestampMillis(item.createdAt);
      if (itemMillis) {
        const itemDate = new Date(itemMillis);
        if (startDate) {
          const s = new Date(startDate);
          s.setHours(0, 0, 0, 0);
          if (itemDate < s) return false;
        }
        if (endDate) {
          const e = new Date(endDate);
          e.setHours(23, 59, 59, 999);
          if (itemDate > e) return false;
        }
      }

      return true;
    });
  }, [ledgerData, selectedSemester, startDate, endDate]);

  // 2. DYNAMIC SOURCES ONLY: extracted strictly from existing transactions (no hardcoded static sources)
  const dynamicSources = useMemo(() => {
    const map = new Map<string, number>();
    dateAndSemFiltered.forEach((tx) => {
      const src = tx.source || 'general';
      map.set(src, (map.get(src) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([value, count]) => ({
        value,
        label: formatTransactionSource(value),
        count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [dateAndSemFiltered]);

  // Ensure selected source resets if no longer present in dynamic list
  const activeSourceValue = useMemo(() => {
    if (selectedSource === 'all') return 'all';
    const exists = dynamicSources.some((s) => s.value === selectedSource);
    return exists ? selectedSource : 'all';
  }, [selectedSource, dynamicSources]);

  // 3. Final Filter: apply dynamic source, transaction type, and text search
  const finalFiltered = useMemo(() => {
    return dateAndSemFiltered.filter((item) => {
      // Source Filter
      if (activeSourceValue !== 'all') {
        const src = item.source || 'general';
        if (src !== activeSourceValue) return false;
      }

      // Type Filter
      if (txType !== 'all') {
        const itemType = (item.type || '').toLowerCase();
        if (itemType !== txType) return false;
      }

      // Search Query Filter
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const descMatch = (item.description || '').toLowerCase().includes(q);
        const refMatch = (item.receiptNumber || '').toLowerCase().includes(q);
        const addedByMatch = (item.addedBy || '').toLowerCase().includes(q);
        if (!descMatch && !refMatch && !addedByMatch) return false;
      }

      return true;
    });
  }, [dateAndSemFiltered, activeSourceValue, txType, searchQuery]);

  // 4. Chronological calculation of running balances
  const chronologicalRows = useMemo(() => {
    const sorted = [...finalFiltered].sort((a, b) => {
      const aDate = parseTimestampMillis(a.date) || parseTimestampMillis(a.createdAt) || 0;
      const bDate = parseTimestampMillis(b.date) || parseTimestampMillis(b.createdAt) || 0;
      return aDate - bDate;
    });

    let running = 0;
    return sorted.map((tx) => {
      const amt = Number(tx.amount) || 0;
      const isInc = String(tx.type || '').toLowerCase() === 'income';
      if (isInc) running += amt;
      else running -= amt;
      return {
        ...tx,
        amount: amt,
        runningBalance: running,
      };
    });
  }, [finalFiltered]);

  // KPI Calculations
  const { totalInflow, totalOutflow, netBalance } = useMemo(() => {
    let inflow = 0;
    let outflow = 0;
    finalFiltered.forEach((tx) => {
      const amt = Number(tx.amount) || 0;
      if (String(tx.type || '').toLowerCase() === 'income') {
        inflow += amt;
      } else {
        outflow += amt;
      }
    });
    return {
      totalInflow: inflow,
      totalOutflow: outflow,
      netBalance: inflow - outflow,
    };
  }, [finalFiltered]);

  // Helper for Selected Semester Label
  const selectedSemesterLabel = useMemo(() => {
    if (selectedSemester === 'all') return 'All Semesters (Historical)';
    const found = semesters.find((s) => s.id === selectedSemester);
    if (!found) return 'Selected Semester';
    return `${found.academicYear || ''} ${found.semester || found.name || ''} (${found.academicLevel || 'College'})`.trim();
  }, [selectedSemester, semesters]);

  const datePeriodLabel = useMemo(() => {
    if (startDate && endDate) return `${startDate} to ${endDate}`;
    if (startDate) return `From ${startDate}`;
    if (endDate) return `Until ${endDate}`;
    return 'All Transaction Dates';
  }, [startDate, endDate]);

  const handleResetFilters = () => {
    setSelectedSemester('all');
    setStartDate('');
    setEndDate('');
    setSelectedSource('all');
    setTxType('all');
    setSearchQuery('');
  };

  // ─── CSV Export Functionality ────────────────────────────────────────────────
  const handleExportCSV = () => {
    if (chronologicalRows.length === 0) {
      toast.error('No transactions available to export for the selected filters.');
      return;
    }

    setIsExporting(true);
    try {
      const escapeCSV = (val: string | number | undefined | null) => {
        if (val === undefined || val === null) return '""';
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
      };

      const metadataRows = [
        `"STI COLLEGE ORMOC - STUDENT AFFAIRS AND SERVICES (SAS)"`,
        `"OFFICIAL FINANCIAL STATEMENT & TRANSACTION LEDGER"`,
        `"Organization: ${organizationName}"`,
        `"Academic Period: ${selectedSemesterLabel}"`,
        `"Date Range: ${datePeriodLabel}"`,
        `"Source Filter: ${activeSourceValue === 'all' ? 'All Dynamic Sources' : formatTransactionSource(activeSourceValue)}"`,
        `"Total Income (Inflow): PHP ${totalInflow.toLocaleString(undefined, { minimumFractionDigits: 2 })}"`,
        `"Total Expenses (Outflow): PHP ${totalOutflow.toLocaleString(undefined, { minimumFractionDigits: 2 })}"`,
        `"Net Operating Balance: PHP ${netBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}"`,
        `"Generated At: ${new Date().toLocaleString()} by ${officerName}"`,
        `""`,
      ];

      const headers = [
        '#',
        'Date',
        'Description',
        'Source',
        'Type',
        'Amount (PHP)',
        'Running Balance (PHP)',
        'OR / Reference #',
        'Recorded By',
      ].map(escapeCSV);

      const tableRows = chronologicalRows.map((tx, idx) => {
        const itemMillis = parseTimestampMillis(tx.date) || parseTimestampMillis(tx.createdAt);
        const formattedDate = itemMillis ? new Date(itemMillis).toLocaleDateString() : 'N/A';
        const isInc = String(tx.type || '').toLowerCase() === 'income';

        return [
          escapeCSV(idx + 1),
          escapeCSV(formattedDate),
          escapeCSV(tx.description || 'General Entry'),
          escapeCSV(formatTransactionSource(tx.source)),
          escapeCSV(isInc ? 'Income' : 'Expense'),
          escapeCSV(tx.amount.toFixed(2)),
          escapeCSV(tx.runningBalance.toFixed(2)),
          escapeCSV(tx.receiptNumber || '—'),
          escapeCSV(tx.addedBy || 'Officer'),
        ].join(',');
      });

      const csvContent = [...metadataRows, headers.join(','), ...tableRows].join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');

      const safeOrg = organizationName.replace(/[^a-zA-Z0-9]/g, '_');
      const safePeriod = selectedSemesterLabel.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
      const dateTag = new Date().toISOString().split('T')[0];

      link.setAttribute('href', url);
      link.setAttribute('download', `${safeOrg}_Financial_Report_${safePeriod}_${dateTag}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success('Financial Report (.csv) exported successfully!');
    } catch (err: any) {
      console.error(err);
      toast.error('Failed to export CSV: ' + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  // ─── PDF Export Functionality ────────────────────────────────────────────────
  const handleExportPDF = () => {
    if (chronologicalRows.length === 0) {
      toast.error('No transactions available to export for the selected filters.');
      return;
    }

    setIsExporting(true);
    try {
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
      });

      const pageWidth = 297;
      const pageHeight = 210;
      const margin = 14;
      let y = margin;

      // ── 1. STI Navy Banner Header ──
      doc.setFillColor(0, 26, 77); // #001A4D
      doc.rect(margin, y, pageWidth - margin * 2, 24, 'F');

      // Yellow accent line
      doc.setFillColor(255, 212, 28); // #FFD41C
      doc.rect(margin, y + 24, pageWidth - margin * 2, 2, 'F');

      // Header Text
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(255, 255, 255);
      doc.text('STI COLLEGE ORMOC', margin + 6, y + 8);

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(255, 212, 28);
      doc.text('STUDENT AFFAIRS AND SERVICES (SAS) • FINANCIAL LEDGER & CASH FLOW STATEMENT', margin + 6, y + 14);

      doc.setFontSize(8);
      doc.setTextColor(200, 215, 245);
      doc.text(
        `Organization: ${organizationName} | Period: ${selectedSemesterLabel} | Dates: ${datePeriodLabel}`,
        margin + 6,
        y + 20
      );

      doc.setFontSize(8);
      doc.setTextColor(230, 230, 230);
      doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - margin - 6, y + 9, { align: 'right' });
      doc.text(`Issuer: ${officerName}`, pageWidth - margin - 6, y + 15, { align: 'right' });

      y += 32;

      // ── 2. KPI Summary Boxes ──
      const boxW = (pageWidth - margin * 2 - 12) / 4;
      const boxH = 14;

      const kpis = [
        { label: 'Total Inflow (Income)', val: formatCurrency(totalInflow), color: [16, 185, 129] },
        { label: 'Total Outflow (Expense)', val: formatCurrency(totalOutflow), color: [239, 68, 68] },
        { label: 'Net Cash Balance', val: formatCurrency(netBalance), color: [14, 78, 189] },
        { label: 'Transactions Logged', val: `${chronologicalRows.length} entries`, color: [0, 26, 77] },
      ];

      kpis.forEach((kpi, idx) => {
        const bx = margin + idx * (boxW + 4);
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(bx, y, boxW, boxH, 2, 2, 'F');
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(bx, y, boxW, boxH, 2, 2, 'S');

        doc.setFontSize(6.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(100, 116, 139);
        doc.text(kpi.label.toUpperCase(), bx + 3, y + 4.5);

        doc.setFontSize(9.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(kpi.color[0], kpi.color[1], kpi.color[2]);
        doc.text(kpi.val, bx + 3, y + 10.5);
      });

      y += boxH + 8;

      // ── 3. Table Header ──
      const colWidths = [10, 26, 75, 45, 20, 30, 30, 33];
      const colHeaders = ['#', 'Date', 'Description', 'Source', 'Type', 'Amount', 'Balance', 'Reference #'];

      const drawTableHeader = () => {
        doc.setFillColor(0, 26, 77);
        doc.rect(margin, y, pageWidth - margin * 2, 7, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(255, 255, 255);

        let cx = margin;
        colHeaders.forEach((ch, idx) => {
          const w = colWidths[idx];
          const alignRight = idx === 5 || idx === 6;
          if (alignRight) {
            doc.text(ch, cx + w - 3, y + 5, { align: 'right' });
          } else {
            doc.text(ch, cx + 2, y + 5);
          }
          cx += w;
        });
        y += 7;
      };

      drawTableHeader();

      // ── 4. Table Rows ──
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);

      chronologicalRows.forEach((tx, idx) => {
        if (y + 7 > pageHeight - 25) {
          doc.addPage('a4', 'landscape');
          y = margin;
          drawTableHeader();
        }

        const isAlt = idx % 2 === 1;
        if (isAlt) {
          doc.setFillColor(248, 250, 252);
          doc.rect(margin, y, pageWidth - margin * 2, 6, 'F');
        }

        const itemMillis = parseTimestampMillis(tx.date) || parseTimestampMillis(tx.createdAt);
        const formattedDate = itemMillis ? new Date(itemMillis).toLocaleDateString() : 'N/A';
        const isInc = String(tx.type || '').toLowerCase() === 'income';

        let cx = margin;

        // #
        doc.setTextColor(140, 140, 140);
        doc.text(String(idx + 1), cx + 2, y + 4.2);
        cx += colWidths[0];

        // Date
        doc.setTextColor(70, 70, 70);
        doc.text(formattedDate, cx + 2, y + 4.2);
        cx += colWidths[1];

        // Description
        doc.setTextColor(20, 20, 20);
        const descTrunc = (tx.description || 'General Entry').length > 45
          ? (tx.description || '').substring(0, 42) + '...'
          : tx.description || 'General Entry';
        doc.text(descTrunc, cx + 2, y + 4.2);
        cx += colWidths[2];

        // Source
        doc.setTextColor(50, 50, 50);
        const srcTrunc = formatTransactionSource(tx.source);
        doc.text(srcTrunc.length > 25 ? srcTrunc.substring(0, 22) + '...' : srcTrunc, cx + 2, y + 4.2);
        cx += colWidths[3];

        // Type
        if (isInc) {
          doc.setTextColor(16, 185, 129);
          doc.text('Income', cx + 2, y + 4.2);
        } else {
          doc.setTextColor(239, 68, 68);
          doc.text('Expense', cx + 2, y + 4.2);
        }
        cx += colWidths[4];

        // Amount
        doc.setTextColor(isInc ? 16 : 239, isInc ? 185 : 68, isInc ? 129 : 68);
        doc.setFont('helvetica', 'bold');
        doc.text(formatCurrency(tx.amount), cx + colWidths[5] - 3, y + 4.2, { align: 'right' });
        doc.setFont('helvetica', 'normal');
        cx += colWidths[5];

        // Running Balance
        doc.setTextColor(0, 26, 77);
        doc.setFont('helvetica', 'bold');
        doc.text(formatCurrency(tx.runningBalance), cx + colWidths[6] - 3, y + 4.2, { align: 'right' });
        doc.setFont('helvetica', 'normal');
        cx += colWidths[6];

        // Reference
        doc.setTextColor(100, 100, 100);
        doc.text((tx.receiptNumber || '—').substring(0, 18), cx + 2, y + 4.2);

        y += 6;
      });

      // ── 5. Formal Signatory Footer ──
      if (y + 22 > pageHeight - margin) {
        doc.addPage('a4', 'landscape');
        y = margin + 10;
      } else {
        y += 10;
      }

      const sigW = (pageWidth - margin * 2 - 30) / 4;
      const sigs = [
        { role: 'Prepared By:', title: 'Club Treasurer', name: officerName },
        { role: 'Audited By:', title: 'Club Auditor', name: 'Student Auditor' },
        { role: 'Approved By:', title: 'Club President', name: 'Club President' },
        { role: 'Noted By:', title: 'SAS Adviser', name: 'SAS Coordinator' },
      ];

      sigs.forEach((sig, sIdx) => {
        const sx = margin + sIdx * (sigW + 10);
        doc.setFontSize(6.5);
        doc.setTextColor(100, 116, 139);
        doc.text(sig.role, sx, y);

        doc.setDrawColor(180, 180, 180);
        doc.line(sx, y + 10, sx + sigW, y + 10);

        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 26, 77);
        doc.text(sig.name, sx, y + 14);

        doc.setFontSize(6.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(120, 120, 120);
        doc.text(sig.title, sx, y + 17.5);
      });

      const safeOrg = organizationName.replace(/[^a-zA-Z0-9]/g, '_');
      const dateTag = new Date().toISOString().split('T')[0];
      doc.save(`${safeOrg}_Financial_Report_${dateTag}.pdf`);

      toast.success('Official STI Financial Report (.pdf) exported successfully!');
    } catch (err: any) {
      console.error(err);
      toast.error('Failed to export PDF: ' + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-gray-200">
        {/* Header */}
        <div className="px-6 py-4 bg-[#001A4D] text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-[#FFD41C]">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                Export Financial Report
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#FFD41C] text-[#001A4D]">
                  {chronologicalRows.length} Records
                </span>
              </h2>
              <p className="text-xs text-blue-200">
                {organizationName} • Filter by academic period, date range, and dynamic transaction sources
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-white/70 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Filter Controls Panel */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#001A4D] uppercase tracking-wider flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-[#0E4EBD]" />
                Filter Parameters
              </span>
              {(selectedSemester !== 'all' || startDate || endDate || activeSourceValue !== 'all' || txType !== 'all' || searchQuery) && (
                <button
                  onClick={handleResetFilters}
                  className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset Filters
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* 1. Semester Filter */}
              <div>
                <label className="block text-[11px] font-bold text-gray-600 mb-1">Academic Semester</label>
                <div className="relative">
                  <select
                    value={selectedSemester}
                    onChange={(e) => setSelectedSemester(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-gray-300 rounded-lg text-gray-800 font-medium focus:ring-2 focus:ring-[#0E4EBD]/30 outline-none cursor-pointer"
                  >
                    <option value="all">All Semesters (Historical)</option>
                    {semesters.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.academicYear || ''} - {s.semester || s.name || ''} ({s.academicLevel || 'College'})
                        {s.status === 'ACTIVE' ? ' ★ ACTIVE' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 2. Start Date */}
              <div>
                <label className="block text-[11px] font-bold text-gray-600 mb-1">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-gray-300 rounded-lg text-gray-800 font-medium focus:ring-2 focus:ring-[#0E4EBD]/30 outline-none cursor-pointer"
                />
              </div>

              {/* 3. End Date */}
              <div>
                <label className="block text-[11px] font-bold text-gray-600 mb-1">End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-gray-300 rounded-lg text-gray-800 font-medium focus:ring-2 focus:ring-[#0E4EBD]/30 outline-none cursor-pointer"
                />
              </div>

              {/* 4. DYNAMIC Source Filter (No static sources) */}
              <div>
                <label className="block text-[11px] font-bold text-gray-600 mb-1">
                  Source <span className="text-[10px] text-blue-600 font-normal">({dynamicSources.length} present)</span>
                </label>
                <select
                  value={activeSourceValue}
                  onChange={(e) => setSelectedSource(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-gray-300 rounded-lg text-gray-800 font-medium focus:ring-2 focus:ring-[#0E4EBD]/30 outline-none cursor-pointer"
                >
                  <option value="all">All Sources ({dateAndSemFiltered.length})</option>
                  {dynamicSources.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label} ({s.count})
                    </option>
                  ))}
                  {dynamicSources.length === 0 && (
                    <option value="" disabled>No sources available in period</option>
                  )}
                </select>
              </div>
            </div>

            {/* Row 2: Type Filter and Search */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-gray-200/60">
              <div className="flex items-center gap-1.5 w-full sm:w-auto">
                <span className="text-xs font-bold text-gray-500 mr-1">Type:</span>
                {(['all', 'income', 'expense'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTxType(t)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      txType === t
                        ? t === 'income'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : t === 'expense'
                          ? 'bg-rose-600 text-white shadow-xs'
                          : 'bg-[#001A4D] text-white shadow-xs'
                        : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {t === 'all' ? 'All Types' : t === 'income' ? 'Income (+)' : 'Expenses (−)'}
                  </button>
                ))}
              </div>

              <div className="relative w-full sm:w-72">
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search description, reference, or officer..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-gray-300 rounded-lg text-gray-800 placeholder-gray-400 focus:ring-2 focus:ring-[#0E4EBD]/30 outline-none"
                />
              </div>
            </div>
          </div>

          {/* KPI Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-xl p-3.5">
              <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wide flex items-center gap-1">
                <ArrowUpRight className="w-3.5 h-3.5" /> Total Inflow
              </span>
              <p className="text-lg font-bold text-emerald-800 mt-1">
                {formatCurrency(totalInflow)}
              </p>
              <span className="text-[10px] text-emerald-600">Total credited income</span>
            </div>

            <div className="bg-rose-50/60 border border-rose-200/80 rounded-xl p-3.5">
              <span className="text-[11px] font-bold text-rose-700 uppercase tracking-wide flex items-center gap-1">
                <ArrowDownLeft className="w-3.5 h-3.5" /> Total Outflow
              </span>
              <p className="text-lg font-bold text-rose-800 mt-1">
                {formatCurrency(totalOutflow)}
              </p>
              <span className="text-[10px] text-rose-600">Disbursed expenditures</span>
            </div>

            <div className="bg-blue-50/60 border border-blue-200/80 rounded-xl p-3.5">
              <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wide flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5" /> Net Operating Balance
              </span>
              <p className="text-lg font-bold text-[#001A4D] mt-1">
                {formatCurrency(netBalance)}
              </p>
              <span className="text-[10px] text-blue-600">Inflows minus outflows</span>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3.5">
              <span className="text-[11px] font-bold text-gray-600 uppercase tracking-wide flex items-center gap-1">
                <Layers className="w-3.5 h-3.5 text-gray-500" /> Matches
              </span>
              <p className="text-lg font-bold text-gray-800 mt-1">
                {chronologicalRows.length}
              </p>
              <span className="text-[10px] text-gray-500">Of {ledgerData.length} total ledger records</span>
            </div>
          </div>

          {/* Table Preview */}
          <div className="border border-gray-200 rounded-xl overflow-hidden shadow-2xs bg-white">
            <div className="px-4 py-2.5 bg-gray-100 border-b border-gray-200 flex items-center justify-between">
              <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                Export Preview Data Table
              </span>
              <span className="text-[11px] text-gray-500 font-medium">
                {chronologicalRows.length === 0 ? 'No rows match filter' : `Displaying ${chronologicalRows.length} transactions`}
              </span>
            </div>

            <div className="max-h-60 overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-gray-50 text-gray-600 font-bold uppercase text-[10px] border-b border-gray-200 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 w-8 text-center">#</th>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Description</th>
                    <th className="px-3 py-2">Source</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2 text-right">Balance</th>
                    <th className="px-3 py-2">Reference #</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium text-gray-700">
                  {chronologicalRows.map((tx, idx) => {
                    const itemMillis = parseTimestampMillis(tx.date) || parseTimestampMillis(tx.createdAt);
                    const formattedDate = itemMillis ? new Date(itemMillis).toLocaleDateString() : 'N/A';
                    const isInc = String(tx.type || '').toLowerCase() === 'income';

                    return (
                      <tr key={tx.id || idx} className="hover:bg-blue-50/30 transition-colors">
                        <td className="px-3 py-2 text-center text-gray-400 font-mono text-[11px]">{idx + 1}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-gray-600">{formattedDate}</td>
                        <td className="px-3 py-2 font-medium text-gray-900 max-w-xs truncate" title={tx.description}>
                          {tx.description}
                        </td>
                        <td className="px-3 py-2">
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-700">
                            {formatTransactionSource(tx.source)}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                            isInc ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60' : 'bg-rose-50 text-rose-700 border border-rose-200/60'
                          }`}>
                            {isInc ? '+ Income' : '− Expense'}
                          </span>
                        </td>
                        <td className={`px-3 py-2 text-right font-bold whitespace-nowrap ${
                          isInc ? 'text-emerald-700' : 'text-rose-700'
                        }`}>
                          {isInc ? '+' : '−'} {formatCurrency(tx.amount)}
                        </td>
                        <td className="px-3 py-2 text-right font-bold text-[#001A4D] whitespace-nowrap">
                          {formatCurrency(tx.runningBalance)}
                        </td>
                        <td className="px-3 py-2 font-mono text-[11px] text-gray-500 whitespace-nowrap">
                          {tx.receiptNumber || '—'}
                        </td>
                      </tr>
                    );
                  })}
                  {chronologicalRows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-gray-400 text-xs">
                        No transactions found for the specified filters. Try adjusting the semester or date range.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Modal Footer (Action Buttons) */}
        <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportCSV}
              disabled={isExporting || chronologicalRows.length === 0}
              className="px-4 py-2 border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              Download Excel / CSV
            </button>

            <button
              type="button"
              onClick={handleExportPDF}
              disabled={isExporting || chronologicalRows.length === 0}
              className="px-5 py-2 bg-[#001A4D] hover:bg-[#0E4EBD] text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
            >
              <Printer className="w-4 h-4 text-[#FFD41C]" />
              Export Official PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

