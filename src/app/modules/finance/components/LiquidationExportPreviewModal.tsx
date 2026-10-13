import { useState, useMemo, useEffect } from 'react';
import {
  X,
  FileSpreadsheet,
  Settings2,
  Eye,
  FileText,
  Sparkles,
  RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';
import { doc, getDoc, collection, query, where, limit, getDocs } from 'firebase/firestore';
import { format } from 'date-fns';
import { db } from '../../../../services/firebase';
import { ACTIVITIES_COLLECTION } from '../../events/services/event.service';
import type { LiquidationDocument } from '../types/liquidation.types';
import { exportOfficialStiLiquidationExcel } from '../utils/sti-liquidation-excel';
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
    report.submittedByName || report.createdByName || ''
  );
  const [chequeNumber, setChequeNumber] = useState(
    (report as any).chequeNumber || (report as any).checkNumber || (report.id ? report.id.slice(0, 8).toUpperCase() : '')
  );
  const [activityEndDate, setActivityEndDate] = useState('');
  const [submissionDeadline, setSubmissionDeadline] = useState('');
  const [dateSubmitted, setDateSubmitted] = useState('');
  const [dateReleased, setDateReleased] = useState('');
  const [amountAdvanced, setAmountAdvanced] = useState<number>(
    report.allocatedBudget || (report as any).totalAllocatedBudget || report.totalActualSpending || 0
  );
  const [daysLapsed, setDaysLapsed] = useState('-o-');
  const [orNumber, setOrNumber] = useState('');

  const [activeTab, setActiveTab] = useState<'preview' | 'metadata'>('preview');
  const [isExporting, setIsExporting] = useState(false);
  const [isAutoFilled, setIsAutoFilled] = useState(false);

  // Synchronize and auto-fill headers from Report, Event, and Ledger
  useEffect(() => {
    if (!isOpen || !report) return;

    let isMounted = true;

    // 1. Initial direct population from liquidation report
    const initialOfficer = report.submittedByName || report.createdByName || '';
    const initialCheque =
      (report as any).chequeNumber ||
      (report as any).checkNumber ||
      (report.id ? report.id.slice(0, 8).toUpperCase() : '');
    const initialAmount = Number(
      report.allocatedBudget ||
      (report as any).totalAllocatedBudget ||
      report.totalActualSpending ||
      (report as any).totalActualSpent ||
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
    const initialOR = lineItemORs.join(', ');

    // Submitted date
    const subDate = parseLocalDate(report.submittedAt || report.createdAt) || new Date();
    const subDateStr = format(subDate, 'MMM d, yyyy');

    setOfficerName(initialOfficer);
    setChequeNumber(initialCheque);
    setAmountAdvanced(initialAmount);
    setOrNumber(initialOR);
    setDateSubmitted(subDateStr);

    // Fallback baseline for activity end date and deadline from report.createdAt
    const fallbackEndDate = parseLocalDate(report.createdAt) || new Date();
    const initialEndStr = format(fallbackEndDate, 'MMM d, yyyy');
    const initialDeadDate = new Date(fallbackEndDate.getTime() + 7 * 24 * 60 * 60 * 1000);
    const initialDeadStr = format(initialDeadDate, 'MMM d, yyyy');

    setActivityEndDate(initialEndStr);
    setSubmissionDeadline(initialDeadStr);
    setDaysLapsed(calculateDaysLapse(subDate, initialDeadDate));

    // 2. Asynchronous enrichment: query Event document and Ledger
    const fetchEnrichedMetadata = async () => {
      try {
        let eventEndParsed: Date | null = null;
        let eventReferenceId = '';
        let eventSupervisor = '';
        let eventReleasedDate: Date | null = null;
        let eventApprovedBudget = 0;

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

            // Determine actual Activity End Date from event sessions (last session date)
            if (
              eventData.sessions &&
              Array.isArray(eventData.sessions) &&
              eventData.sessions.length > 0
            ) {
              const validSessions = eventData.sessions.filter((s: any) => s && s.date);
              if (validSessions.length > 0) {
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
              eventEndParsed = parseLocalDate(eventData.completedAt || eventData.createdAt);
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

        // Apply enriched event values
        if (eventEndParsed) {
          const endStr = format(eventEndParsed, 'MMM d, yyyy');
          const deadlineDate = new Date(eventEndParsed.getTime() + 7 * 24 * 60 * 60 * 1000);
          const deadlineStr = format(deadlineDate, 'MMM d, yyyy');

          setActivityEndDate(endStr);
          setSubmissionDeadline(deadlineStr);
          setDaysLapsed(calculateDaysLapse(subDate, deadlineDate));
        }

        if (!initialOfficer && eventSupervisor) {
          setOfficerName(eventSupervisor);
        }

        if (eventReferenceId && initialCheque === report.id?.slice(0, 8).toUpperCase()) {
          setChequeNumber(eventReferenceId);
        }

        if (initialAmount === 0 && (eventApprovedBudget > 0 || ledgerAmount > 0)) {
          setAmountAdvanced(eventApprovedBudget || ledgerAmount);
        }

        if (!initialOR && ledgerReceipt) {
          setOrNumber(ledgerReceipt);
        }

        const finalReleased = ledgerDate || eventReleasedDate || eventEndParsed;
        if (finalReleased) {
          setDateReleased(format(finalReleased, 'MMM d, yyyy'));
        }

        setIsAutoFilled(true);
      } catch (err) {
        console.error('[LiquidationExportPreviewModal] Error fetching event details:', err);
      }
    };

    fetchEnrichedMetadata();

    return () => {
      isMounted = false;
    };
  }, [isOpen, report?.id, report?.eventId]);

  // Handle dynamic Activity End Date change -> auto calculates deadline (+7 days) and lapse
  const handleActivityEndDateChange = (val: string) => {
    setActivityEndDate(val);
    const parsed = parseLocalDate(val);
    if (parsed) {
      const newDeadline = new Date(parsed.getTime() + 7 * 24 * 60 * 60 * 1000);
      const newDeadlineStr = format(newDeadline, 'MMM d, yyyy');
      setSubmissionDeadline(newDeadlineStr);

      const subParsed = parseLocalDate(dateSubmitted) || new Date();
      setDaysLapsed(calculateDaysLapse(subParsed, newDeadline));
    }
  };

  // Handle dynamic Date Submitted change -> recalculates lapse
  const handleDateSubmittedChange = (val: string) => {
    setDateSubmitted(val);
    const subParsed = parseLocalDate(val);
    const deadParsed = parseLocalDate(submissionDeadline);
    if (subParsed && deadParsed) {
      setDaysLapsed(calculateDaysLapse(subParsed, deadParsed));
    }
  };

  // Reset to auto-calculated STI standards
  const handleResetToStandard = () => {
    const parsedEnd = parseLocalDate(activityEndDate);
    if (parsedEnd) {
      const standardDeadline = new Date(parsedEnd.getTime() + 7 * 24 * 60 * 60 * 1000);
      const deadStr = format(standardDeadline, 'MMM d, yyyy');
      setSubmissionDeadline(deadStr);
      const subParsed = parseLocalDate(dateSubmitted) || new Date();
      setDaysLapsed(calculateDaysLapse(subParsed, standardDeadline));
      toast.info('Recalculated 7-day deadline and lapse from activity end date.');
    }
  };

  // Categorized Items for Preview
  const categorizedItems = useMemo(() => {
    const map = new Map<string, typeof report.lineItems>();
    (report.lineItems || []).forEach((item) => {
      const cat = (item.category || 'General Expenses').trim();
      if (!map.has(cat)) {
        map.set(cat, []);
      }
      map.get(cat)!.push(item);
    });
    return Array.from(map.entries());
  }, [report.lineItems]);

  // Export Action (Strictly omitting signatories/matrix)
  const handleExportExcel = () => {
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
        includeSignatures: false, // Explicitly no signatories/matrix
      });
      toast.success('Official STI Liquidation Excel exported successfully!');
      onClose();
    } catch (err) {
      console.error('Failed to export STI liquidation Excel', err);
      toast.error('Failed to generate official Excel file.');
    } finally {
      setIsExporting(false);
    }
  };

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
                  Official STI Liquidation Export Engine
                </h3>
                <span className="px-2 py-0.5 bg-[#FFD41C] text-[#001A4D] text-[10px] font-mono font-bold rounded-md uppercase">
                  LIQUIDATION-FORMAT v1.0
                </span>
              </div>
              <p className="text-xs text-white/70">
                STI College Official Financial Liquidation Template Generator
              </p>
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
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'preview'
                  ? 'bg-[#001A4D] text-white shadow-xs'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>1. Clean Template Preview</span>
            </button>

            <button
              onClick={() => setActiveTab('metadata')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'metadata'
                  ? 'bg-[#001A4D] text-white shadow-xs'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>2. Official Header Parameters</span>
              {isAutoFilled && (
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse ml-0.5" />
              )}
            </button>
          </div>

          <div className="flex items-center gap-3 text-xs font-bold">
            <span className="text-gray-500">Total Actual Spent:</span>
            <span className="text-[#001A4D] font-mono text-sm">
              {formatCurrency(report.totalActualSpending || (report as any).totalActualSpent || 0)}
            </span>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-100/70">
          {/* TAB 1: CLEAN MONOCHROME STI FORMAT PREVIEW */}
          {activeTab === 'preview' && (
            <div className="space-y-6 max-w-4xl mx-auto">
              <div className="bg-white border-2 border-gray-400 rounded-lg shadow-sm p-6 font-sans text-xs space-y-6">
                {/* 1. Header Section */}
                <div className="border-b-2 border-black pb-4">
                  <div className="flex justify-between items-center mb-2">
                    <h2 className="text-base font-bold text-black uppercase tracking-tight">
                      LIQUIDATION REPORT FOR {(report.eventTitle || 'Event Activity').toUpperCase()}
                    </h2>
                    <button
                      onClick={() => setActiveTab('metadata')}
                      className="text-xs text-[#0E4EBD] hover:underline font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Settings2 className="w-3.5 h-3.5" />
                      <span>Edit Header Parameters →</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 mt-3 text-[11px] text-black">
                    <div className="flex justify-between border-b border-gray-200 py-0.5">
                      <span className="font-bold">Employee / Officer Name:</span>
                      <span>{officerName || '—'}</span>
                    </div>
                    <div className="flex justify-between border-b border-gray-200 py-0.5">
                      <span className="font-bold">Date Of Activity End:</span>
                      <span>{activityEndDate || '—'}</span>
                    </div>
                    <div className="flex justify-between border-b border-gray-200 py-0.5">
                      <span className="font-bold">Cheque Number:</span>
                      <span className="font-mono">{chequeNumber || '—'}</span>
                    </div>
                    <div className="flex justify-between border-b border-gray-200 py-0.5">
                      <span className="font-bold">Deadline For The Liquidation Submissions:</span>
                      <span>{submissionDeadline || '—'}</span>
                    </div>
                    <div className="flex justify-between border-b border-gray-200 py-0.5">
                      <span className="font-bold">Purpose:</span>
                      <span>{report.eventTitle}</span>
                    </div>
                    <div className="flex justify-between border-b border-gray-200 py-0.5">
                      <span className="font-bold">Date Submitted:</span>
                      <span>{dateSubmitted || '—'}</span>
                    </div>
                    <div className="flex justify-between border-b border-gray-200 py-0.5">
                      <span className="font-bold">Amount:</span>
                      <span className="font-bold font-mono">{formatCurrency(amountAdvanced)}</span>
                    </div>
                    <div className="flex justify-between border-b border-gray-200 py-0.5">
                      <span className="font-bold">No. Of Days Lapse:</span>
                      <span>{daysLapsed}</span>
                    </div>
                    {dateReleased && (
                      <div className="flex justify-between border-b border-gray-200 py-0.5">
                        <span className="font-bold">Date Released:</span>
                        <span>{dateReleased}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* 2. Section Header */}
                <div className="text-[11px] font-bold text-black uppercase">
                  CHARGE TO EXPENSE/REFUNDABLE ACCOUNT:
                </div>

                {/* 3. Expenses Breakdown Table (Monochrome Grid matching original template) */}
                <div className="border border-black overflow-hidden">
                  <table className="w-full text-left border-collapse text-[11px]">
                    <thead>
                      <tr className="bg-white text-black font-bold text-center border-b border-black">
                        <th className="p-2 border-r border-black w-[24%]">PARTICULAR</th>
                        <th className="p-2 border-r border-black w-[14%]">AMOUNT</th>
                        <th colSpan={3} className="p-2 border-r border-black">ACTUAL EXPENSES BREAKDOWN</th>
                        <th className="p-2 w-[18%]">Remarks</th>
                      </tr>
                      <tr className="bg-white text-black font-bold text-[10px] text-center border-b border-black">
                        <th className="p-1.5 border-r border-black font-normal">Breakdown For Cash Advances</th>
                        <th className="p-1.5 border-r border-black"></th>
                        <th className="p-1.5 border-r border-black">Amount</th>
                        <th className="p-1.5 border-r border-black">Total Amount</th>
                        <th className="p-1.5 border-r border-black">Variance</th>
                        <th className="p-1.5"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-300 font-mono text-[11px]">
                      {categorizedItems.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-6 text-center text-gray-400 font-sans">
                            No recorded liquidation line items.
                          </td>
                        </tr>
                      ) : (
                        categorizedItems.map(([category, items], catIdx) => {
                          const letter = String.fromCharCode(65 + catIdx);
                          const catAllocated = items.reduce((sum, i) => sum + (i.allocatedCost || 0), 0);

                          return items.map((item, itemIdx) => {
                            const isFirst = itemIdx === 0;
                            const itemVariance = (item.allocatedCost || 0) > 0
                              ? (item.allocatedCost || 0) - (item.totalCost || 0)
                              : 0;

                            return (
                              <tr key={item.id || `${catIdx}-${itemIdx}`}>
                                <td className="p-1.5 border-r border-black font-sans font-bold text-black">
                                  {isFirst ? `${letter}. ${category}` : ''}
                                </td>
                                <td className="p-1.5 border-r border-black text-right text-black">
                                  {isFirst ? (catAllocated > 0 ? formatCurrency(catAllocated) : '—') : ''}
                                </td>
                                <td className="p-1.5 border-r border-black font-sans text-black">
                                  {item.description || item.vendorName}
                                </td>
                                <td className="p-1.5 border-r border-black text-right text-black">
                                  {formatCurrency(item.totalCost || 0)}
                                </td>
                                <td className="p-1.5 border-r border-black text-right text-black">
                                  {formatCurrency(itemVariance)}
                                </td>
                                <td className="p-1.5 text-black font-sans text-[10px]">
                                  {item.receiptNumber ? `OR# ${item.receiptNumber}` : item.vendorName || '—'}
                                </td>
                              </tr>
                            );
                          });
                        })
                      )}

                      {/* Totals Row */}
                      <tr className="bg-white font-bold border-t-2 border-black text-black">
                        <td className="p-2 border-r border-black font-sans">Total Cash Advance</td>
                        <td className="p-2 border-r border-black text-right font-mono">
                          {formatCurrency(amountAdvanced)}
                        </td>
                        <td className="p-2 border-r border-black font-sans">Total Actual Expense</td>
                        <td className="p-2 border-r border-black text-right font-mono">
                          {formatCurrency(report.totalActualSpending || (report as any).totalActualSpent || 0)}
                        </td>
                        <td className="p-2 border-r border-black text-right font-mono">
                          {formatCurrency(amountAdvanced - (report.totalActualSpending || (report as any).totalActualSpent || 0))}
                        </td>
                        <td className="p-2 font-sans text-xs">—</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* 4. Balance Summary Note Block */}
                <div className="bg-white p-4 border border-black space-y-1 text-[11px] text-black">
                  <div className="font-bold mb-1">Note: </div>
                  <div className="flex justify-between w-72">
                    <span className="font-medium">Amount Advanced:</span>
                    <span className="font-mono font-bold">{formatCurrency(amountAdvanced)}</span>
                  </div>
                  <div className="flex justify-between w-72">
                    <span className="font-medium">Total Actual Expense:</span>
                    <span className="font-mono font-bold">
                      {formatCurrency(report.totalActualSpending || (report as any).totalActualSpent || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between w-72 pt-1 border-t border-black">
                    <span className="font-bold">Balance: </span>
                    <span className="font-mono font-bold underline">
                      {formatCurrency(amountAdvanced - (report.totalActualSpending || (report as any).totalActualSpent || 0))}
                    </span>
                  </div>
                  {orNumber && (
                    <div className="text-[10px] pt-1">
                      OR NO: <strong>{orNumber}</strong>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: OFFICIAL HEADER PARAMETERS */}
          {activeTab === 'metadata' && (
            <div className="max-w-3xl mx-auto bg-white border border-gray-200 rounded-2xl p-6 shadow-xs space-y-5">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <div>
                  <h4 className="font-bold text-sm text-[#001A4D]">
                    Official Liquidation Header Parameters
                  </h4>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Synchronized from event sessions, allocations, and receipts.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 text-[11px] font-bold rounded-lg border border-emerald-200 flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3 text-emerald-600" />
                    Auto-filled
                  </span>
                  <button
                    onClick={handleResetToStandard}
                    className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                    title="Recalculate 7-day deadline and lapse"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block text-[11px] font-bold text-gray-600 mb-1">
                    Employee / Officer Name
                  </label>
                  <input
                    type="text"
                    value={officerName}
                    onChange={(e) => setOfficerName(e.target.value)}
                    placeholder="Officer name..."
                    className="w-full p-2.5 bg-gray-50/50 border border-gray-300 rounded-lg font-semibold text-gray-900 focus:bg-white focus:border-[#0E4EBD] focus:ring-1 focus:ring-[#0E4EBD] outline-none"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">From submitter / custodian</p>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-600 mb-1">
                    Cheque Number
                  </label>
                  <input
                    type="text"
                    value={chequeNumber}
                    onChange={(e) => setChequeNumber(e.target.value)}
                    placeholder="Cheque # / Ref #..."
                    className="w-full p-2.5 bg-gray-50/50 border border-gray-300 rounded-lg font-mono font-bold text-gray-900 focus:bg-white focus:border-[#0E4EBD] focus:ring-1 focus:ring-[#0E4EBD] outline-none"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">From reference / check</p>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-600 mb-1">
                    Date Of Activity End
                  </label>
                  <input
                    type="text"
                    value={activityEndDate}
                    onChange={(e) => handleActivityEndDateChange(e.target.value)}
                    placeholder="e.g. Oct 8, 2026"
                    className="w-full p-2.5 bg-gray-50/50 border border-gray-300 rounded-lg text-gray-900 focus:bg-white focus:border-[#0E4EBD] focus:ring-1 focus:ring-[#0E4EBD] outline-none font-medium"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">From event concluding session</p>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-600 mb-1">
                    Deadline For Submissions
                  </label>
                  <input
                    type="text"
                    value={submissionDeadline}
                    onChange={(e) => setSubmissionDeadline(e.target.value)}
                    placeholder="e.g. Oct 15, 2026"
                    className="w-full p-2.5 bg-gray-50/50 border border-gray-300 rounded-lg text-gray-900 focus:bg-white focus:border-[#0E4EBD] focus:ring-1 focus:ring-[#0E4EBD] outline-none font-medium"
                  />
                  <p className="text-[10px] text-emerald-600 mt-1">Auto-calculated: 7 days after activity end (STI Policy)</p>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-600 mb-1">
                    Amount (Cash Advance ₱)
                  </label>
                  <input
                    type="number"
                    value={amountAdvanced}
                    onChange={(e) => setAmountAdvanced(Number(e.target.value))}
                    className="w-full p-2.5 bg-gray-50/50 border border-gray-300 rounded-lg font-mono font-bold text-gray-900 focus:bg-white focus:border-[#0E4EBD] focus:ring-1 focus:ring-[#0E4EBD] outline-none"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">Allocated advance budget</p>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-600 mb-1">
                    No. Of Days Lapse
                  </label>
                  <input
                    type="text"
                    value={daysLapsed}
                    onChange={(e) => setDaysLapsed(e.target.value)}
                    placeholder="-o-"
                    className="w-full p-2.5 bg-gray-50/50 border border-gray-300 rounded-lg font-mono text-gray-900 focus:bg-white focus:border-[#0E4EBD] focus:ring-1 focus:ring-[#0E4EBD] outline-none font-semibold"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">'-o-' if on time, or lapse days if overdue</p>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-600 mb-1">
                    Official Receipt (OR) Number
                  </label>
                  <input
                    type="text"
                    value={orNumber}
                    onChange={(e) => setOrNumber(e.target.value)}
                    placeholder="OR Number..."
                    className="w-full p-2.5 bg-gray-50/50 border border-gray-300 rounded-lg font-mono text-gray-900 focus:bg-white focus:border-[#0E4EBD] focus:ring-1 focus:ring-[#0E4EBD] outline-none"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">Line item receipts or transaction OR</p>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-600 mb-1">
                    Date Submitted
                  </label>
                  <input
                    type="text"
                    value={dateSubmitted}
                    onChange={(e) => handleDateSubmittedChange(e.target.value)}
                    placeholder="e.g. Oct 8, 2026"
                    className="w-full p-2.5 bg-gray-50/50 border border-gray-300 rounded-lg text-gray-900 focus:bg-white focus:border-[#0E4EBD] focus:ring-1 focus:ring-[#0E4EBD] outline-none font-medium"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">From liquidation submission timestamp</p>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-[11px] font-bold text-gray-600 mb-1">
                    Date Released (Disbursement Date)
                  </label>
                  <input
                    type="text"
                    value={dateReleased}
                    onChange={(e) => setDateReleased(e.target.value)}
                    placeholder="e.g. Oct 1, 2026"
                    className="w-full p-2.5 bg-gray-50/50 border border-gray-300 rounded-lg text-gray-900 focus:bg-white focus:border-[#0E4EBD] focus:ring-1 focus:ring-[#0E4EBD] outline-none font-medium"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">Cash advance release date from ledger/event</p>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={() => setActiveTab('preview')}
                  className="px-4 py-2 bg-[#001A4D] hover:bg-[#0E4EBD] text-white rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>View Live Template Preview →</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <footer className="px-6 py-4 bg-white border-t border-gray-200 flex items-center justify-between flex-shrink-0">
          <div className="text-xs text-gray-500 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
            <span>
              Format ready: <strong>LIQUIDATION-FORMAT_v1.xlsx</strong> ({report.lineItems?.length || 0} line items).
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              disabled={isExporting}
              className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-xs font-bold hover:bg-gray-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              onClick={handleExportExcel}
              disabled={isExporting}
              className="px-6 py-2.5 bg-[#001A4D] hover:bg-[#0E4EBD] text-white rounded-xl text-xs font-bold disabled:opacity-50 transition-all shadow-md flex items-center gap-2 cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-[#FFD41C]" />
              <span>{isExporting ? 'Generating Official Excel...' : 'Download Official STI Excel (.xls)'}</span>
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
