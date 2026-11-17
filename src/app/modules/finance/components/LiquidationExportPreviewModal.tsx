import { useState, useMemo, useEffect } from 'react';
import {
  X,
  FileSpreadsheet,
  Eye,
  Download,
} from 'lucide-react';
import { toast } from 'sonner';
import { doc, getDoc, collection, query, where, limit, getDocs } from 'firebase/firestore';
import { format } from 'date-fns';
import { db } from '../../../../services/firebase';
import { ACTIVITIES_COLLECTION } from '../../events/services/event.service';
import type { LiquidationDocument } from '../types/liquidation.types';
import {
  exportOfficialStiLiquidationExcel,
  enrichLiquidationSignatures,
  groupLiquidationData,
  resolveOfficialSignatories,
  type StiSignatory,
} from '../utils/sti-liquidation-excel';
import { formatCurrency } from '../../../utils/currency';
import { formatAppDate, parseDateSafe } from '../../../utils/date';

interface LiquidationExportPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: LiquidationDocument | null;
}

/**
 * Safely parses any date representation into a local JS Date object,
 * ensuring date-only strings (YYYY-MM-DD) do not shift days due to UTC offsets,
 * and stripping any trailing 'Z' artifacts.
 */
function parseLocalDate(input: any): Date | null {
  if (!input) return null;
  if (typeof input === 'string') {
    const trimmed = input.trim().replace(/Z$/, '');
    const ymdMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (ymdMatch) {
      const year = parseInt(ymdMatch[1], 10);
      const month = parseInt(ymdMatch[2], 10) - 1;
      const day = parseInt(ymdMatch[3], 10);
      return new Date(year, month, day);
    }
  }
  return parseDateSafe(input);
}

/**
 * Computes calendar days lapse between submitted date and deadline.
 * If submitted on or before deadline, returns standard STI notation '-o-'.
 * If overdue, returns 'X days'.
 */
function calculateDaysLapse(submittedDate: Date | null, deadlineDate: Date | null): string {
  if (!submittedDate || !deadlineDate) return '-o-';
  const subMid = new Date(submittedDate.getFullYear(), submittedDate.getMonth(), submittedDate.getDate()).getTime();
  const deadMid = new Date(deadlineDate.getFullYear(), deadlineDate.getMonth(), deadlineDate.getDate()).getTime();
  const diffDays = Math.round((subMid - deadMid) / (24 * 60 * 60 * 1000));
  return diffDays > 0 ? `${diffDays} day${diffDays === 1 ? '' : 's'}` : '-o-';
}

export function LiquidationExportPreviewModal({
  isOpen,
  onClose,
  report,
}: LiquidationExportPreviewModalProps) {
  if (!isOpen || !report) return null;

  // Metadata form state
  const [officerName, setOfficerName] = useState(
    report.submittedByName ||
    (report as any).employeeName ||
    report.preparedBy?.name ||
    report.createdByName ||
    ''
  );
  const [chequeNumber, setChequeNumber] = useState(
    (report as any).chequeNumber || (report as any).checkNumber || report.disbursementVoucher?.chequeNumber || ''
  );
  const [activityEndDate, setActivityEndDate] = useState('');
  const [submissionDeadline, setSubmissionDeadline] = useState('');
  const [dateSubmitted, setDateSubmitted] = useState('');
  const [dateReleased, setDateReleased] = useState('');
  const [amountAdvanced, setAmountAdvanced] = useState<number>(
    Number((report as any).amountAdvanced ?? report.allocatedBudget ?? (report as any).totalAllocatedBudget ?? 0)
  );
  const [daysLapsed, setDaysLapsed] = useState('-o-');
  const [orNumber, setOrNumber] = useState('');
  const [baselineCategories, setBaselineCategories] = useState<
    Array<{ id?: string; title: string; baselineAmount: number }>
  >([]);

  const [activeTab, setActiveTab] = useState<'preview' | 'metadata'>('preview');
  const [isExporting, setIsExporting] = useState(false);
  const [enrichedReport, setEnrichedReport] = useState<LiquidationDocument>(report);

  // Synchronize and auto-fill headers from Report, Event, and Ledger
  useEffect(() => {
    if (!isOpen || !report) return;

    let isMounted = true;
    setEnrichedReport(report);

    enrichLiquidationSignatures(report)
      .then((withSigs) => {
        if (isMounted && withSigs) {
          setEnrichedReport(withSigs);
        }
      })
      .catch(() => {
        // fallback cleanly to original report
      });

    // 1. Initial direct population from saved liquidation report
    const initialOfficer =
      report.submittedByName ||
      (report as any).employeeName ||
      (report as any).officerName ||
      report.preparedBy?.name ||
      report.createdByName ||
      '';
    const initialCheque =
      (report as any).chequeNumber ||
      (report as any).checkNumber ||
      report.disbursementVoucher?.chequeNumber ||
      '';
    const initialAmount = Number(
      (report as any).amountAdvanced ??
      report.allocatedBudget ??
      (report as any).totalAllocatedBudget ??
      0
    );

    // Extract all unique Official Receipt numbers from line items
    const lineItemORs = Array.from(
      new Set(
        (report.lineItems || [])
          .map((i) => i.receiptNumber?.trim())
          .filter((n): n is string => Boolean(n && n.length > 0))
      )
    );
    const initialOR = (report as any).orNumber || lineItemORs.join(', ');

    // Submitted date
    const subDate = (report as any).dateSubmitted
      ? parseLocalDate((report as any).dateSubmitted) || new Date()
      : parseLocalDate(report.submittedAt || report.createdAt) || new Date();
    const subDateStr = format(subDate, 'MMM d, yyyy');

    setOfficerName(initialOfficer);
    setChequeNumber(initialCheque);
    setAmountAdvanced(initialAmount);
    setOrNumber(initialOR);
    setDateSubmitted(subDateStr);

    // Initial activity end date, deadline, released date, and days lapsed
    const initialEndDateVal = (report as any).activityEndDate
      ? parseLocalDate((report as any).activityEndDate)
      : null;
    const initialDeadlineVal = (report as any).submissionDeadline
      ? parseLocalDate((report as any).submissionDeadline)
      : null;
    const initialReleasedVal = (report as any).dateReleased
      ? parseLocalDate((report as any).dateReleased)
      : null;

    if (initialEndDateVal) {
      setActivityEndDate(format(initialEndDateVal, 'MMM d, yyyy'));
    }
    if (initialDeadlineVal) {
      setSubmissionDeadline(format(initialDeadlineVal, 'MMM d, yyyy'));
    }
    if (initialReleasedVal) {
      setDateReleased(format(initialReleasedVal, 'MMM d, yyyy'));
    }
    if ((report as any).daysLapsed) {
      setDaysLapsed((report as any).daysLapsed);
    } else if (initialEndDateVal && initialDeadlineVal) {
      setDaysLapsed(calculateDaysLapse(subDate, initialDeadlineVal));
    } else {
      // Fallback baseline for activity end date and deadline from report.createdAt
      const fallbackEndDate = parseLocalDate(report.createdAt) || new Date();
      const initialEndStr = format(fallbackEndDate, 'MMM d, yyyy');
      const initialDeadDate = new Date(fallbackEndDate.getTime() + 15 * 24 * 60 * 60 * 1000);
      const initialDeadStr = format(initialDeadDate, 'MMM d, yyyy');

      if (!initialEndDateVal) setActivityEndDate(initialEndStr);
      if (!initialDeadlineVal) setSubmissionDeadline(initialDeadStr);
      setDaysLapsed(calculateDaysLapse(subDate, initialDeadDate));
    }

    // 2. Asynchronous enrichment: query Event document and Ledger
    const fetchEnrichedMetadata = async () => {
      try {
        let eventEndParsed: Date | null = null;
        let eventReferenceId = '';
        let eventSupervisor = '';
        let eventReleasedDate: Date | null = null;
        let eventApprovedBudget = 0;
        let eventBaselines: Array<{ id?: string; title: string; baselineAmount: number }> = [];

        // Fetch Event from activities collection
        if (report.eventId) {
          const eventRef = doc(db, ACTIVITIES_COLLECTION, report.eventId);
          const eventSnap = await getDoc(eventRef);
          if (eventSnap.exists() && isMounted) {
            const eventData = eventSnap.data() as any;
            eventReferenceId = eventData.referenceId || '';
            eventSupervisor =
              eventData.supervisorName ||
              eventData.budgetCustodians?.[0]?.personName ||
              '';
            eventApprovedBudget = Number(
              eventData.totalApprovedBudget || eventData.totalAllocatedBudget || 0
            );

            // Extract proposal baseline categories (Left Side of Form LF-01)
            if (Array.isArray(eventData.budgetItems) && eventData.budgetItems.length > 0) {
              eventBaselines = eventData.budgetItems.map((bi: any, idx: number) => ({
                id: bi.id || `prop_bi_${idx}`,
                title: bi.item || bi.description || `Budget Item ${idx + 1}`,
                baselineAmount: Number(
                  bi.approvedAmount || bi.totalCost || (Number(bi.quantity || 1) * Number(bi.unitCost || 0)) || 0
                ),
              }));
            } else if (
              Array.isArray(eventData.financialProjections?.expenses) &&
              eventData.financialProjections.expenses.length > 0
            ) {
              eventBaselines = eventData.financialProjections.expenses.map((exp: any, idx: number) => ({
                id: exp.id || `prop_exp_${idx}`,
                title: exp.description || exp.item || `Proposed Item ${idx + 1}`,
                baselineAmount: Number(exp.totalAmount || exp.thisYearProposed || 0),
              }));
            } else if (
              Array.isArray(eventData.budgetCustodians) &&
              eventData.budgetCustodians.length > 0
            ) {
              eventBaselines = eventData.budgetCustodians.map((c: any, idx: number) => ({
                id: c.id || `prop_cust_${idx}`,
                title: c.purpose || c.item || `Allocation ${idx + 1}`,
                baselineAmount: Number(c.allocatedAmount || 0),
              }));
            }

            // Prioritize actual event conclusion date (`concludedAt` / `completedAt`), then last session date
            eventEndParsed = parseLocalDate(eventData.concludedAt || eventData.completedAt);

            if (
              eventData.sessions &&
              Array.isArray(eventData.sessions) &&
              eventData.sessions.length > 0
            ) {
              const validSessions = eventData.sessions.filter((s: any) => s && s.date);
              if (!eventEndParsed && validSessions.length > 0) {
                validSessions.sort((a: any, b: any) => (a.date > b.date ? 1 : -1));
                const lastSession = validSessions[validSessions.length - 1];
                eventEndParsed = parseLocalDate(lastSession.date);
              }
              const firstSession = eventData.sessions[0];
              if (firstSession?.date) {
                eventReleasedDate = parseLocalDate(firstSession.date);
              }
            }

            if (!eventEndParsed) {
              eventEndParsed = parseLocalDate(eventData.createdAt);
            }

            if (!eventReleasedDate) {
              eventReleasedDate = parseLocalDate(eventData.createdAt);
            }
          }
        }

        // Ledger lookup (sao_ledger or organization_ledger) for disbursement info
        let ledgerReceipt = '';
        let ledgerDate: Date | null = null;
        let ledgerAmount = 0;

        if (report.eventId) {
          try {
            const saoQ = query(
              collection(db, 'sao_ledger'),
              where('eventId', '==', report.eventId),
              limit(1)
            );
            const saoSnap = await getDocs(saoQ);
            if (!saoSnap.empty) {
              const lData = saoSnap.docs[0].data() as any;
              ledgerReceipt = lData.receiptNumber || '';
              if (lData.date) ledgerDate = parseLocalDate(lData.date);
              ledgerAmount = Number(lData.amount || 0);
            } else {
              const orgQ = query(
                collection(db, 'organization_ledger'),
                where('eventId', '==', report.eventId),
                limit(1)
              );
              const orgSnap = await getDocs(orgQ);
              if (!orgSnap.empty) {
                const lData = orgSnap.docs[0].data() as any;
                ledgerReceipt = lData.receiptNumber || '';
                if (lData.date) ledgerDate = parseLocalDate(lData.date);
                ledgerAmount = Number(lData.amount || 0);
              }
            }
          } catch (ledgerErr) {
            console.warn('[LiquidationExportPreviewModal] Ledger lookup note:', ledgerErr);
          }
        }

        if (!isMounted) return;

        if (eventBaselines.length > 0) {
          setBaselineCategories(eventBaselines);
        }

        // Apply enriched event values if not already persisted on the report
        if (!initialEndDateVal && eventEndParsed) {
          const endStr = format(eventEndParsed, 'MMM d, yyyy');
          const deadlineDate = new Date(eventEndParsed.getTime() + 15 * 24 * 60 * 60 * 1000);
          const deadlineStr = format(deadlineDate, 'MMM d, yyyy');

          setActivityEndDate(endStr);
          if (!initialDeadlineVal) setSubmissionDeadline(deadlineStr);
          setDaysLapsed(calculateDaysLapse(subDate, deadlineDate));
        }

        if (!initialOfficer && eventSupervisor) {
          setOfficerName(eventSupervisor);
        }

        if (!initialCheque && eventReferenceId) {
          setChequeNumber(eventReferenceId);
        }

        if (initialAmount === 0 && (eventApprovedBudget > 0 || ledgerAmount > 0)) {
          setAmountAdvanced(eventApprovedBudget || ledgerAmount);
        }

        if (!initialOR && ledgerReceipt) {
          setOrNumber(ledgerReceipt);
        }

        if (!initialReleasedVal) {
          const finalReleased = ledgerDate || eventReleasedDate || eventEndParsed;
          if (finalReleased) {
            setDateReleased(format(finalReleased, 'MMM d, yyyy'));
          }
        }
      } catch (err) {
        console.error('[LiquidationExportPreviewModal] Error fetching event details:', err);
      }
    };

    fetchEnrichedMetadata();

    return () => {
      isMounted = false;
    };
  }, [isOpen, report?.id, report?.eventId]);

  // Group items matching the official two-sided layout
  const groupedDisplayCategories = useMemo(
    () =>
      groupLiquidationData(report, {
        amountAdvanced,
        proposedBaselineCategories: baselineCategories,
      }),
    [report, baselineCategories, amountAdvanced]
  );

  const totalCashAdvanceSum = useMemo(
    () => groupedDisplayCategories.reduce((sum, g) => sum + Number(g.baselineAmount || 0), 0),
    [groupedDisplayCategories]
  );

  const totalActualSum = useMemo(
    () =>
      groupedDisplayCategories.reduce(
        (sum, g) => sum + g.items.reduce((s, it) => s + Number(it.totalCost || 0), 0),
        0
      ),
    [groupedDisplayCategories]
  );

  // Resolve official signatories from live report submitter and approvalChain
  const displaySignatories: StiSignatory[] = useMemo(
    () =>
      resolveOfficialSignatories(enrichedReport || report, {
        officerName,
        dateSubmitted,
      }),
    [enrichedReport, report, officerName, dateSubmitted]
  );

  // Export Action (Genuine Office Open XML .xlsx)
  const handleExportXlsx = async () => {
    setIsExporting(true);
    try {
      await exportOfficialStiLiquidationExcel(enrichedReport || report, {
        officerName,
        chequeNumber,
        activityEndDate,
        submissionDeadline,
        dateSubmitted,
        dateReleased,
        amountAdvanced,
        daysLapsed,
        orNumber,
        proposedBaselineCategories: baselineCategories,
        signatories: displaySignatories,
        includeSignatures: true,
        exportFormat: 'xlsx',
      });
      toast.success('Official STI Liquidation (.xlsx) exported successfully!');
      onClose();
    } catch (err) {
      console.error('Failed to export STI liquidation Excel', err);
      toast.error('Failed to generate official Excel file.');
    } finally {
      setIsExporting(false);
    }
  };

  // Alternative Export Action (Styled XML Spreadsheet .xls)
  const handleExportXml = () => {
    setIsExporting(true);
    try {
      exportOfficialStiLiquidationExcel(report, {
        officerName,
        chequeNumber,
        activityEndDate,
        submissionDeadline,
        dateSubmitted,
        dateReleased,
        amountAdvanced,
        daysLapsed,
        orNumber,
        proposedBaselineCategories: baselineCategories,
        signatories: displaySignatories,
        includeSignatures: true,
        exportFormat: 'xls',
      });
      toast.success('Official STI Liquidation (.xls) exported successfully!');
      onClose();
    } catch (err) {
      console.error('Failed to export STI liquidation XML', err);
      toast.error('Failed to generate official Excel file.');
    } finally {
      setIsExporting(false);
    }
  };

  const eventTitleUpper = (report.eventTitle || (report as any).activityTitle || 'Event Activity').toUpperCase();
  const effectiveAdvance = totalCashAdvanceSum > 0 ? totalCashAdvanceSum : Number(amountAdvanced || 0);
  const netBalance = Number(amountAdvanced || effectiveAdvance) - totalActualSum;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-xs" onClick={onClose} />

      <div className="relative w-full max-w-5xl h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-200">
        {/* Modal Header */}
        <header className="bg-[#001A4D] px-6 py-4 flex items-center justify-between flex-shrink-0 text-white shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#0E4EBD] rounded-xl flex items-center justify-center text-[#FFD41C] shadow-inner">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-base text-white tracking-tight">
                  Official STI Financial Liquidation Export
                </h3>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="p-2 text-white/70 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Tab Navigation & Status Bar */}
        <div className="bg-gray-50 border-b border-gray-200 px-6 py-2.5 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('preview')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${activeTab === 'preview'
                ? 'bg-[#001A4D] text-white shadow-xs'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'
                }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Export Preview</span>
            </button>
          </div>

          <div className="flex items-center gap-3 text-xs font-bold">
            <span className="text-gray-500">Total Actual Spent:</span>
            <span className="text-[#001A4D] font-mono text-sm">
              {formatCurrency(totalActualSum)}
            </span>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-100/70">
          {/* CLEAN MONOCHROME STI FORMAT PREVIEW */}
          {activeTab === 'preview' && (
            <div className="space-y-6 max-w-5xl mx-auto">
              <div
                className="bg-white border border-gray-400 rounded-lg shadow-sm p-6 text-black space-y-5"
                style={{ fontFamily: 'Calibri, sans-serif' }}
              >
                {/* 1. Header Section (Calibri 12pt Bold Underline Title + Calibri 10pt Bold Underline Fields) */}
                <div>
                  <h2 className="text-center text-[15px] font-bold underline text-black uppercase tracking-tight mb-3">
                    LIQUIDATION REPORT FOR {eventTitleUpper}
                  </h2>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 text-[12px] text-black font-bold">
                    <div className="py-0.5 underline">
                      Employee Name:&nbsp;&nbsp;&nbsp;{officerName || '—'}
                    </div>
                    <div className="py-0.5 underline">
                      Date Of Activity End:&nbsp;&nbsp;&nbsp;{activityEndDate || '—'}
                    </div>
                    <div className="py-0.5 underline">
                      Cheque Number:&nbsp;&nbsp;&nbsp;{chequeNumber || '—'}
                    </div>
                    <div className="py-0.5 underline">
                      Deadline For The Liquidation Submissions:&nbsp;&nbsp;&nbsp;{submissionDeadline || '—'}
                    </div>
                    <div className="py-0.5 underline">
                      Purpose:&nbsp;&nbsp;&nbsp;{eventTitleUpper}
                    </div>
                    <div className="py-0.5 underline">
                      Date Submitted:&nbsp;&nbsp;&nbsp;{dateSubmitted || '—'}
                    </div>
                    <div className="py-0.5 underline">
                      Amount:&nbsp;&nbsp;&nbsp;{formatCurrency(amountAdvanced)}
                    </div>
                    <div className="py-0.5 underline">
                      No. Of Days Lapse:&nbsp;&nbsp;&nbsp;{daysLapsed}
                    </div>
                    <div className="py-0.5 underline">
                      Date Released:&nbsp;&nbsp;&nbsp;{dateReleased || '—'}
                    </div>
                  </div>
                </div>

                {/* 2. Section Header */}
                <div className="flex items-center gap-3 text-[12px] font-bold text-black uppercase pt-1">
                  <span className="underline">CHARGE TO EXPENSE/REFUNDABLE ACCOUNT:</span>
                  <span className="inline-block min-w-[180px] border-b-2 border-black h-4" />
                </div>

                {/* 3. Expenses Breakdown Table (Exact 7-Column Grid matching STI Template) */}
                <div className="border-2 border-black overflow-x-auto">
                  <table className="w-full text-left border-collapse text-[12px]">
                    <thead>
                      <tr className="bg-white text-black font-bold text-center">
                        <th className="px-2 py-1 border-r-2 border-black w-[24%]">PARTICULAR</th>
                        <th className="px-2 py-1 border-r-2 border-black w-[11%]">AMOUNT</th>
                        <th colSpan={3} className="px-2 py-1 border-r border-black">
                          ACTUAL EXPENSES BREAKDOWN
                        </th>
                        <th className="px-2 py-1 border-r-2 border-black w-[10%]"></th>
                        <th className="px-2 py-1 w-[16%]">Remarks/Reference</th>
                      </tr>
                      <tr className="bg-white text-black font-bold text-[11px] text-center border-b-2 border-black">
                        <th
                          className="px-2 py-1 border-r-2 border-black font-bold"
                          style={{ fontFamily: 'Arial, sans-serif' }}
                        >
                          Breakdown For Cash Advances
                        </th>
                        <th className="px-2 py-1 border-r-2 border-black"></th>
                        <th className="px-2 py-1 w-[21%]"></th>
                        <th className="px-2 py-1 w-[9%]">Amount</th>
                        <th className="px-2 py-1 border-r border-black w-[9%]">Total Amount</th>
                        <th className="px-2 py-1 border-r-2 border-black">Variance</th>
                        <th className="px-2 py-1"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/70 text-[12px]">
                      {groupedDisplayCategories.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-6 text-center text-gray-400">
                            No recorded liquidation line items.
                          </td>
                        </tr>
                      ) : (
                        groupedDisplayCategories.map((group, catIdx) => {
                          const letter = String.fromCharCode(65 + catIdx);
                          const hasLetterPrefix = /^[A-Za-z]\.\s+/.test(group.categoryTitle);
                          const categoryParticular = hasLetterPrefix ? group.categoryTitle : `${letter}. ${group.categoryTitle}`;
                          const baseline = Number(group.baselineAmount || 0);

                          if (group.items.length === 0) {
                            return (
                              <tr key={`cat_${catIdx}`} className="border-b border-black/70">
                                <td className="px-2 py-1.5 border-r border-black font-bold text-black">
                                  {categoryParticular}
                                </td>
                                <td className="px-2 py-1.5 border-r border-black text-right text-black font-bold">
                                  {baseline > 0 ? formatCurrency(baseline) : '—'}
                                </td>
                                <td className="px-2 py-1.5 border-r border-black text-black font-bold">
                                  —
                                </td>
                                <td className="px-2 py-1.5 border-r border-black text-right text-black font-bold">
                                  ₱0.00
                                </td>
                                <td className="px-2 py-1.5 border-r border-black text-right text-black font-bold">
                                  0.00
                                </td>
                                <td className="px-2 py-1.5 border-r border-black text-right text-black">
                                  {baseline.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                                <td className="px-2 py-1.5 text-black font-bold text-[13px]"></td>
                              </tr>
                            );
                          }

                          const catActualSum = group.items.reduce((s, it) => s + Number(it.totalCost || 0), 0);
                          const catVariance = baseline - catActualSum;

                          return group.items.map((item, itemIdx) => {
                            const isFirst = itemIdx === 0;
                            const hasQtyMultiplier = item.quantity > 1 && item.unitCost > 0;
                            const displayDesc = hasQtyMultiplier
                              ? `${item.description} (${item.quantity} x ₱${item.unitCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`
                              : item.description;
                            const colDVal = hasQtyMultiplier ? item.unitCost : item.totalCost;

                            return (
                              <tr key={item.id || `${catIdx}_${itemIdx}`} className="border-b border-black/70">
                                <td className="px-2 py-1.5 border-r border-black font-bold text-black">
                                  {isFirst ? categoryParticular : ''}
                                </td>
                                <td className="px-2 py-1.5 border-r border-black text-right text-black font-bold">
                                  {isFirst ? (baseline > 0 ? formatCurrency(baseline) : '') : ''}
                                </td>
                                <td
                                  className={`px-2 py-1.5 border-r border-black text-black ${
                                    isFirst ? 'font-bold' : 'font-bold italic'
                                  }`}
                                >
                                  {displayDesc}
                                </td>
                                <td className="px-2 py-1.5 border-r border-black text-right text-black font-bold">
                                  {formatCurrency(colDVal)}
                                </td>
                                <td className="px-2 py-1.5 border-r border-black text-right text-black font-bold">
                                  {item.totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                                <td className="px-2 py-1.5 border-r border-black text-right text-black">
                                  {isFirst
                                    ? catVariance < 0
                                      ? `(${Math.abs(catVariance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`
                                      : catVariance === 0
                                        ? '-'
                                        : catVariance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                    : ''}
                                </td>
                                <td className="px-2 py-1.5 text-black font-bold text-[13px]">
                                  {item.receiptNumber ? `OR #${item.receiptNumber}` : (item.vendorName || '')}
                                </td>
                              </tr>
                            );
                          });
                        })
                      )}

                      {/* Totals Row (7 aligned columns) */}
                      <tr className="bg-white font-bold border-t border-black text-black">
                        <td className="px-2 py-1.5 border-r border-black text-right font-bold italic">
                          Total Cash Advance
                        </td>
                        <td className="px-2 py-1.5 border-r border-black text-right font-bold underline">
                          {formatCurrency(totalCashAdvanceSum)}
                        </td>
                        <td className="px-2 py-1.5 border-r border-black text-right font-bold italic">
                          Total Actual Expense
                        </td>
                        <td className="px-2 py-1.5 border-r border-black"></td>
                        <td className="px-2 py-1.5 border-r border-black text-right font-bold underline">
                          {totalActualSum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-2 py-1.5 border-r border-black text-right font-bold underline">
                          {formatCurrency(totalCashAdvanceSum - totalActualSum)}
                        </td>
                        <td className="px-2 py-1.5"></td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* 4. Balance Summary Note Block */}
                <div className="pt-2 space-y-1 text-[12px] text-black">
                  <div>Note:</div>
                  <div className="flex items-center gap-4">
                    <span className="font-bold text-right w-52">Amount Advanced:</span>
                    <span className="font-bold text-right w-28">
                      {formatCurrency(Number(amountAdvanced || effectiveAdvance))}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-bold text-right w-52">Total Actual Expense</span>
                    <span className="font-bold text-right w-28 border-b border-black pb-0.5">
                      {totalActualSum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-bold text-right w-52">Balance:</span>
                    <span className="font-bold text-center w-28 border-t border-black border-b-4 border-double py-0.5">
                      {formatCurrency(netBalance)}
                    </span>
                    <span
                      className="font-bold italic text-[10px] pl-2"
                      style={{ fontFamily: 'Arial, sans-serif' }}
                    >
                      OR NO: {orNumber}
                    </span>
                  </div>

                  {((enrichedReport.surplusReturnAllocations?.length || 0) > 0 ||
                    (enrichedReport.allocations?.length || 0) > 0) && (
                    <div className="pt-3 mt-2 border-t border-black/30">
                      <div className="font-bold text-[11px] uppercase tracking-wider mb-1">
                        Fund Source Allocation &amp; Surplus Return Breakdown
                      </div>
                      <table className="w-full border-collapse border border-black text-[11px]">
                        <thead>
                          <tr className="bg-gray-100 border-b border-black font-bold">
                            <th className="border-r border-black px-2 py-1 text-left">Source Bucket</th>
                            <th className="border-r border-black px-2 py-1 text-left">Fund Type</th>
                            <th className="border-r border-black px-2 py-1 text-right">Pulled / Allocated</th>
                            <th className="px-2 py-1 text-right">Returned Surplus</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(enrichedReport.surplusReturnAllocations?.length
                            ? enrichedReport.surplusReturnAllocations.map((r) => ({
                                bucketId: r.bucketId,
                                bucketName: r.bucketName,
                                fundType: r.fundType,
                                pulled: r.originalAllocatedAmount,
                                returned: r.returnAmount,
                              }))
                            : (enrichedReport.allocations || []).map((a) => ({
                                bucketId: a.bucketId,
                                bucketName: a.bucketName,
                                fundType: a.fundType,
                                pulled: a.allocatedAmount,
                                returned: 0,
                              }))
                          ).map((row) => (
                            <tr key={row.bucketId} className="border-t border-black/60">
                              <td className="border-r border-black px-2 py-1 font-semibold">
                                {row.bucketName}
                              </td>
                              <td className="border-r border-black px-2 py-1">
                                {row.fundType === 'misc_fee'
                                  ? 'Miscellaneous Fee'
                                  : row.fundType === 'org_treasury'
                                    ? 'Organization Treasury'
                                    : 'Retained Student Contribution'}
                              </td>
                              <td className="border-r border-black px-2 py-1 text-right font-mono">
                                {formatCurrency(row.pulled)}
                              </td>
                              <td className="px-2 py-1 text-right font-mono font-bold">
                                {formatCurrency(row.returned)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* 5. Official Signatories Block matching Rows 51-76 (Arial 10pt) */}
                <div
                  className="pt-4 space-y-5 text-[12px] text-black"
                  style={{ fontFamily: 'Arial, sans-serif' }}
                >
                  {displaySignatories.map((sig, sIdx) => {
                    const isNoted = sig.type.toLowerCase().includes('noted');
                    return (
                      <div key={sig.id || sIdx} className="grid grid-cols-12 items-end gap-x-4">
                        <div className="col-span-4 text-left pb-5">{sig.type}</div>
                        <div className="col-span-5 text-center">
                          {sig.signatureUrl && (
                            <div className="flex justify-center mb-0.5">
                              <img
                                src={sig.signatureUrl}
                                alt={`${sig.name || sig.type} signature`}
                                className="h-9 max-w-[140px] object-contain"
                              />
                            </div>
                          )}
                          <div
                            className={`border-b-2 border-black min-h-[20px] px-2 ${
                              isNoted ? 'font-bold' : 'font-normal'
                            }`}
                          >
                            {sig.name || ''}
                          </div>
                          <div className="italic pt-0.5">{sig.role}</div>
                        </div>
                        <div className="col-span-3 text-center">
                          <div className="border-b-2 border-black min-h-[20px] px-2">
                            {sig.date || ''}
                          </div>
                          <div className="italic pt-0.5">(Date)</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <footer className="px-6 py-4 bg-white border-t border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 flex-shrink-0">
          <div className="text-xs text-gray-500 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
            <span>
              Export template ready ({report.lineItems?.length || 0} line items).
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={onClose}
              disabled={isExporting}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-xl text-xs font-bold hover:bg-gray-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              onClick={handleExportXml}
              disabled={isExporting}
              className="px-4 py-2 border border-blue-300 bg-blue-50 text-[#001A4D] hover:bg-blue-100 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
              title="Download formatted XML spreadsheet (.xls)"
            >
              <Download className="w-3.5 h-3.5 text-[#0E4EBD]" />
              <span>Export .xls</span>
            </button>

            <button
              onClick={handleExportXlsx}
              disabled={isExporting}
              className="px-5 py-2 bg-[#001A4D] hover:bg-[#0E4EBD] text-white rounded-xl text-xs font-bold disabled:opacity-50 transition-all shadow-md flex items-center gap-2 cursor-pointer"
              title="Download official Excel workbook (.xlsx)"
            >
              <FileSpreadsheet className="w-4 h-4 text-[#FFD41C]" />
              <span>{isExporting ? 'Generating Official Excel...' : 'Download Official Excel (.xlsx)'}</span>
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
