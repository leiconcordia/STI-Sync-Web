import { useState, useMemo, useEffect } from 'react';
import {
  X,
  FileSpreadsheet,
  Settings2,
  Eye,
  FileText,
  Sparkles,
  RotateCcw,
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
  exportOfficialStiLiquidationXlsx,
  exportOfficialStiLiquidationXml,
  type StiSignatory,
} from '../utils/sti-liquidation-excel';
import { formatCurrency } from '../../../utils/currency';
import { formatAppDate, parseDateSafe } from '../../../utils/date';
import { resolveSignatoryLabel } from '../../signatories/utils/signatory-label.utils';

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
    report.preparedBy?.name ||
    (report as any).employeeName ||
    report.submittedByName ||
    report.createdByName ||
    ''
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
  const [baselineCategories, setBaselineCategories] = useState<
    Array<{ id?: string; title: string; baselineAmount: number }>
  >([]);

  const [activeTab, setActiveTab] = useState<'preview' | 'metadata'>('preview');
  const [isExporting, setIsExporting] = useState(false);
  const [isAutoFilled, setIsAutoFilled] = useState(false);

  // Synchronize and auto-fill headers from Report, Event, and Ledger
  useEffect(() => {
    if (!isOpen || !report) return;

    let isMounted = true;

    // 1. Initial direct population from saved liquidation report
    const initialOfficer =
      report.preparedBy?.name ||
      (report as any).employeeName ||
      (report as any).officerName ||
      report.submittedByName ||
      report.createdByName ||
      '';
    const initialCheque =
      (report as any).chequeNumber ||
      (report as any).checkNumber ||
      '';
    const initialAmount = Number(
      (report as any).amountAdvanced ||
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

  // Handle dynamic Activity End Date change -> auto calculates deadline (+15 days) and lapse
  const handleActivityEndDateChange = (val: string) => {
    setActivityEndDate(val);
    const parsed = parseLocalDate(val);
    if (parsed) {
      const newDeadline = new Date(parsed.getTime() + 15 * 24 * 60 * 60 * 1000);
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
      const standardDeadline = new Date(parsedEnd.getTime() + 15 * 24 * 60 * 60 * 1000);
      const deadStr = format(standardDeadline, 'MMM d, yyyy');
      setSubmissionDeadline(deadStr);
      const subParsed = parseLocalDate(dateSubmitted) || new Date();
      setDaysLapsed(calculateDaysLapse(subParsed, standardDeadline));
      toast.info('Recalculated 15-day deadline and lapse from activity end date.');
    }
  };

  // Group items matching the two-sided layout of LIQUIDATION-FORMAT_v1 (2) - Copy.xlsx
  const groupedDisplayCategories = useMemo(() => {
    const groups: Array<{
      categoryTitle: string;
      baselineAmount: number;
      items: typeof report.lineItems;
    }> = [];
    const assignedIds = new Set<string>();

    if (baselineCategories.length > 0) {
      baselineCategories.forEach((cat) => {
        const catTitle = cat.title.trim();
        const matches = (report.lineItems || []).filter((it, idx) => {
          const key = it.id || `item_${idx}`;
          if (assignedIds.has(key)) return false;
          const match =
            it.proposedItemId === cat.id ||
            (it.proposedItemTitle && it.proposedItemTitle.trim().toLowerCase() === catTitle.toLowerCase()) ||
            (it.category && it.category.trim().toLowerCase() === catTitle.toLowerCase());
          if (match) {
            assignedIds.add(key);
            return true;
          }
          return false;
        });

        groups.push({
          categoryTitle: catTitle,
          baselineAmount: Number(cat.baselineAmount || 0),
          items: matches,
        });
      });
    }

    const unassigned = (report.lineItems || []).filter((it, idx) => !assignedIds.has(it.id || `item_${idx}`));
    if (unassigned.length > 0) {
      if (baselineCategories.length === 0) {
        const dynamicMap = new Map<string, { baselineAmount: number; items: typeof report.lineItems }>();
        unassigned.forEach((it) => {
          const name = (it.proposedItemTitle || it.category || 'General Expenses').trim();
          if (!dynamicMap.has(name)) {
            dynamicMap.set(name, {
              baselineAmount: Number(it.proposedBaselineAmount || it.allocatedCost || 0),
              items: [],
            });
          }
          dynamicMap.get(name)!.items.push(it);
        });
        dynamicMap.forEach((val, key) => {
          groups.push({ categoryTitle: key, baselineAmount: val.baselineAmount, items: val.items });
        });
      } else {
        groups.push({
          categoryTitle: 'Other / Unplanned Expenses',
          baselineAmount: 0,
          items: unassigned,
        });
      }
    }

    if (groups.length === 0) {
      groups.push({
        categoryTitle: 'General Expenses',
        baselineAmount: Number(amountAdvanced || report.allocatedBudget || 0),
        items: [],
      });
    }

    return groups;
  }, [baselineCategories, report.lineItems, amountAdvanced, report.allocatedBudget]);

  // Resolve official signatories for preview
  const displaySignatories: StiSignatory[] = useMemo(() => {
    const chain = report.approvalChain || [];
    const findSigner = (predicate: (s: any) => boolean) => chain.find(predicate);

    const accountantStep = findSigner(
      (s) =>
        s.role === 'accountant' ||
        s.roleTitle?.toLowerCase().includes('accountant') ||
        s.actionType === 'check'
    );

    const supervisorStep = findSigner(
      (s) =>
        s.role === 'adviser' ||
        s.role === 'sas_head' ||
        s.roleTitle?.toLowerCase().includes('adviser') ||
        s.roleTitle?.toLowerCase().includes('supervisor')
    );

    const adminStep = findSigner(
      (s) =>
        s.role === 'school_administrator' ||
        s.roleTitle?.toLowerCase().includes('administrator') ||
        s.roleTitle?.toLowerCase().includes('principal')
    );

    const presidentStep = findSigner(
      (s) =>
        s.role === 'school_president' ||
        s.roleTitle?.toLowerCase().includes('president')
    );

    const formatSignerDate = (step?: any) => {
      if (!step) return '';
      const rawDate = step.signedAt || step.approvedAt;
      return rawDate ? formatAppDate(rawDate, '') : '';
    };

    const makerRole =
      report.preparedBy?.roleTitle ||
      (report.submittedByRole === 'sas_admin' || (report as any).createdByRole === 'sas_admin'
        ? 'SAS Administrator'
        : 'Organization Adviser');

    return [
      {
        id: 'sig_sub',
        type: 'Submitted By:',
        name: officerName,
        role: `(${makerRole})`,
        date: dateSubmitted,
      },
      {
        id: 'sig_chk',
        type: 'Checked By:',
        name: accountantStep?.signatoryName || 'Emily L. Rojas',
        role: '(Accountant)',
        date: formatSignerDate(accountantStep),
      },
      {
        id: 'sig_ind',
        type: 'Indorsed By:',
        name: supervisorStep?.signatoryName || 'ENGR. SHEENA JOY MUYUELA',
        role: '(Supervisor)',
        date: formatSignerDate(supervisorStep),
      },
      {
        id: 'sig_rec',
        type: 'Recommending Approval:',
        name: supervisorStep?.signatoryName || 'ENGR. SHEENA JOY MUYUELA',
        role: '(Supervisor)',
        date: formatSignerDate(supervisorStep),
      },
      {
        id: 'sig_app',
        type: 'Approved By:',
        name: adminStep?.signatoryName || 'ENGR. SHEENA JOY MUYUELA',
        role: '(Administrator)',
        date: formatSignerDate(adminStep),
      },
      {
        id: 'sig_not',
        type: 'Noted By:',
        name: presidentStep?.signatoryName || 'ATTY. ANTONIO R. LUCERO JR.',
        role: '(President)',
        date: formatSignerDate(presidentStep),
      },
    ];
  }, [report.approvalChain, officerName, dateSubmitted]);

  // Export Action (Default: Genuine Office Open XML .xlsx)
  const handleExportXlsx = () => {
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
              <span>Template Preview</span>
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
                  </div>

                  <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 mt-3 text-[11px] text-black">
                    <div className="flex justify-between border-b border-gray-200 py-0.5">
                      <span className="font-bold">Employee Name:</span>
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
                        <th className="p-2 w-[18%]">Remarks/Reference</th>
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
                      {groupedDisplayCategories.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-6 text-center text-gray-400 font-sans">
                            No recorded liquidation line items.
                          </td>
                        </tr>
                      ) : (
                        groupedDisplayCategories.map((group, catIdx) => {
                          const letter = String.fromCharCode(65 + catIdx);
                          const categoryParticular = `${letter}. ${group.categoryTitle}`;
                          const baseline = group.baselineAmount;

                          if (group.items.length === 0) {
                            return (
                              <tr key={`cat_${catIdx}`} className="hover:bg-gray-50/50">
                                <td className="p-1.5 border-r border-black font-sans font-bold text-black">
                                  {categoryParticular}
                                </td>
                                <td className="p-1.5 border-r border-black text-right text-black font-mono font-bold">
                                  {baseline > 0 ? formatCurrency(baseline) : '—'}
                                </td>
                                <td className="p-1.5 border-r border-black font-sans text-gray-400 italic">
                                  —
                                </td>
                                <td className="p-1.5 border-r border-black text-right text-gray-400 font-mono">
                                  ₱0.00
                                </td>
                                <td className="p-1.5 border-r border-black text-right text-gray-400 font-mono">
                                  ₱0.00
                                </td>
                                <td className="p-1.5 border-r border-black text-right text-black font-mono">
                                  {formatCurrency(baseline)}
                                </td>
                                <td className="p-1.5 text-gray-400 font-sans text-[10px]">—</td>
                              </tr>
                            );
                          }

                          return group.items.map((item, itemIdx) => {
                            const isFirst = itemIdx === 0;
                            const itemCost = Number(item.totalCost || 0);

                            return (
                              <tr key={item.id || `${catIdx}_${itemIdx}`} className="hover:bg-gray-50/50">
                                <td className="p-1.5 border-r border-black font-sans font-bold text-black">
                                  {isFirst ? categoryParticular : ''}
                                </td>
                                <td className="p-1.5 border-r border-black text-right text-black font-mono font-bold">
                                  {isFirst ? (baseline > 0 ? formatCurrency(baseline) : '—') : ''}
                                </td>
                                <td className="p-1.5 border-r border-black font-sans text-black">
                                  {item.description || item.vendorName || '—'}
                                </td>
                                <td className="p-1.5 border-r border-black text-right text-black font-mono">
                                  {formatCurrency(itemCost)}
                                </td>
                                <td className="p-1.5 border-r border-black text-right text-black font-mono">
                                  {formatCurrency(itemCost)}
                                </td>
                                <td className="p-1.5 border-r border-black text-right text-gray-400 font-mono">
                                  -
                                </td>
                                <td className="p-1.5 text-black font-sans text-[10px]">
                                  {item.receiptNumber ? `OR #${item.receiptNumber}` : (item.vendorName || '—')}
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

                {/* 5. Official Signatories Block matching Rows 55-76 */}
                <div className="bg-white p-4 border border-black space-y-3 text-[11px] text-black">
                  <div className="font-bold uppercase tracking-wider text-[10px] text-gray-500 border-b border-gray-200 pb-1">
                    Official Signatory &amp; Audit Endorsements
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 pt-1">
                    {displaySignatories.map((sig, sIdx) => (
                      <div key={sig.id || sIdx} className="space-y-0.5">
                        <span className="font-bold text-gray-800 text-[10px] uppercase block">{sig.type}</span>
                        <div className="border-b border-black pb-0.5 flex justify-between items-end">
                          <span className="font-bold text-black text-xs">{sig.name || '—'}</span>
                          <span className="text-[10px] text-gray-600 font-mono">{sig.date || '(Date)'}</span>
                        </div>
                        <div className="text-[10px] text-gray-500">{sig.role}</div>
                      </div>
                    ))}
                  </div>
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
