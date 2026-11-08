import * as _XLSX from 'xlsx-js-style';
const XLSX = (_XLSX as any).default || _XLSX;
import type { LiquidationDocument } from '../types/liquidation.types';
import { formatAppDate, parseDateSafe } from '../../../utils/date';
import { resolveSignatoryLabel } from '../../signatories/utils/signatory-label.utils';

export interface StiSignatory {
  id: string;
  type: string; // e.g., 'Submitted By:', 'Checked By:', 'Indorsed By:', 'Recommending Approval:', 'Approved By:', 'Noted By:'
  name: string; // e.g., officer name or signatory name
  role: string; // e.g., '(Name of Employee / Treasurer)', '(Accountant)', '(Supervisor)', '(Administrator)', '(President)'
  date?: string;
}

export interface StiLiquidationExcelOptions {
  officerName?: string;
  chequeNumber?: string;
  activityEndDate?: string;
  submissionDeadline?: string;
  dateSubmitted?: string;
  dateReleased?: string;
  amountAdvanced?: number;
  daysLapsed?: string;
  orNumber?: string;
  signatories?: StiSignatory[];
  includeSignatures?: boolean;
  proposedBaselineCategories?: Array<{ id?: string; title: string; baselineAmount: number }>;
  exportFormat?: 'xlsx' | 'xls';
}

function escapeXml(unsafe: string | number | undefined | null): string {
  if (unsafe === undefined || unsafe === null) return '';
  const str = String(unsafe);
  return str.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case "'": return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

interface GroupedCategoryData {
  categoryTitle: string;
  baselineAmount: number;
  items: Array<{
    description: string;
    totalCost: number;
    receiptNumber?: string;
    vendorName?: string;
  }>;
}

/**
 * Organizes liquidation line items into the official two-sided structure:
 * - Left side: Proposed budget baseline particulars and amounts from proposal
 * - Center: Actual expenses breakdown entered after event approval
 */
function groupLiquidationData(
  report: LiquidationDocument,
  options: StiLiquidationExcelOptions
): GroupedCategoryData[] {
  const lineItems = report.lineItems || [];
  const baselineCategories = options.proposedBaselineCategories || [];

  const groups: GroupedCategoryData[] = [];
  const assignedItemIds = new Set<string>();

  // 1. Process proposed baseline categories from proposal first
  if (baselineCategories.length > 0) {
    baselineCategories.forEach((cat) => {
      const catTitle = cat.title.trim();
      const matchingItems = lineItems.filter((it, idx) => {
        const itemKey = it.id || `item_${idx}`;
        if (assignedItemIds.has(itemKey)) return false;

        const isMatch =
          it.proposedItemId === cat.id ||
          (it.proposedItemTitle && it.proposedItemTitle.trim().toLowerCase() === catTitle.toLowerCase()) ||
          (it.category && it.category.trim().toLowerCase() === catTitle.toLowerCase());

        if (isMatch) {
          assignedItemIds.add(itemKey);
          return true;
        }
        return false;
      });

      groups.push({
        categoryTitle: catTitle,
        baselineAmount: Number(cat.baselineAmount || 0),
        items: matchingItems.map((it) => ({
          description: it.description || it.vendorName || '—',
          totalCost: Number(it.totalCost || 0),
          receiptNumber: it.receiptNumber || '',
          vendorName: it.vendorName || '',
        })),
      });
    });
  }

  // 2. Process any remaining actual line items not matched to proposed categories
  const unassignedItems = lineItems.filter((it, idx) => !assignedItemIds.has(it.id || `item_${idx}`));
  if (unassignedItems.length > 0) {
    // If no baseline categories were provided, group unassigned items by their own proposed title or category
    if (baselineCategories.length === 0) {
      const dynamicCatMap = new Map<string, GroupedCategoryData>();
      unassignedItems.forEach((it) => {
        const catName = (it.proposedItemTitle || it.category || 'General Expenses').trim();
        if (!dynamicCatMap.has(catName)) {
          dynamicCatMap.set(catName, {
            categoryTitle: catName,
            baselineAmount: Number(it.proposedBaselineAmount || it.allocatedCost || 0),
            items: [],
          });
        }
        dynamicCatMap.get(catName)!.items.push({
          description: it.description || it.vendorName || '—',
          totalCost: Number(it.totalCost || 0),
          receiptNumber: it.receiptNumber || '',
          vendorName: it.vendorName || '',
        });
      });
      dynamicCatMap.forEach((val) => groups.push(val));
    } else {
      // Append as Other / Unplanned Expenses
      groups.push({
        categoryTitle: 'Other / Unplanned Expenses',
        baselineAmount: 0,
        items: unassignedItems.map((it) => ({
          description: it.description || it.vendorName || '—',
          totalCost: Number(it.totalCost || 0),
          receiptNumber: it.receiptNumber || '',
          vendorName: it.vendorName || '',
        })),
      });
    }
  }

  if (groups.length === 0) {
    groups.push({
      categoryTitle: 'General Expenses',
      baselineAmount: Number(options.amountAdvanced || report.allocatedBudget || 0),
      items: [],
    });
  }

  return groups;
}

/**
 * Builds the official signatories list matching LIQUIDATION-FORMAT_v1 (2) - Copy.xlsx (Rows 55-76)
 */
function resolveOfficialSignatories(
  report: LiquidationDocument,
  options: StiLiquidationExcelOptions
): StiSignatory[] {
  if (options.signatories && options.signatories.length > 0) {
    return options.signatories;
  }

  const officerName = options.officerName || report.submittedByName || report.createdByName || '';
  const dateSubmitted = options.dateSubmitted || formatAppDate(report.submittedAt || report.createdAt, '');
  const chain = report.approvalChain || [];

  const formatSignerDate = (step?: any) => {
    if (!step) return '';
    const rawDate = step.signedAt || step.approvedAt;
    return rawDate ? formatAppDate(rawDate, '') : '';
  };

  const signatoriesList: StiSignatory[] = [
    {
      id: 'sig_submitted',
      type: 'Submitted By:',
      name: officerName,
      role: '(Name of Employee / Treasurer)',
      date: dateSubmitted,
    },
  ];

  if (chain.length > 0) {
    chain.forEach((step, idx) => {
      const isLast = idx === chain.length - 1;
      const formalLabel = step.signatoryLabel || resolveSignatoryLabel(step, 'liquidation', isLast);
      signatoriesList.push({
        id: step.id || `sig_step_${idx + 1}`,
        type: formalLabel,
        name: step.signatoryName || '',
        role: step.roleTitle ? `(${step.roleTitle})` : '',
        date: formatSignerDate(step),
      });
    });
  }

  return signatoriesList;
}

/**
 * Generates and downloads a genuine Office Open XML (.xlsx) file
 * matching LIQUIDATION-FORMAT_v1 (2) - Copy.xlsx with full styles,
 * solid black borders, column widths, and accounting formats.
 */
export function exportOfficialStiLiquidationXlsx(
  report: LiquidationDocument,
  options: StiLiquidationExcelOptions = {}
) {
  const eventTitle = (report.eventTitle || (report as any).activityTitle || 'Event Activity').toUpperCase();
  const officerName = options.officerName || report.submittedByName || report.createdByName || '';
  const chequeNumber =
    options.chequeNumber ||
    (report as any).chequeNumber ||
    (report as any).checkNumber ||
    (report.id ? report.id.slice(0, 8).toUpperCase() : '');

  const rawEndDate = options.activityEndDate || formatAppDate(report.createdAt, '');
  const activityEndDate = rawEndDate.replace(/Z$/, '').trim();

  let fallbackDeadline = '';
  const parsedEnd = parseDateSafe(activityEndDate || report.createdAt);
  if (parsedEnd) {
    const deadDate = new Date(parsedEnd.getTime() + 15 * 24 * 60 * 60 * 1000);
    fallbackDeadline = formatAppDate(deadDate, '');
  }
  const submissionDeadline = (options.submissionDeadline || fallbackDeadline).replace(/Z$/, '').trim();

  const rawSubmitted =
    options.dateSubmitted ||
    formatAppDate(report.submittedAt || report.createdAt, new Date().toLocaleDateString());
  const dateSubmitted = rawSubmitted.replace(/Z$/, '').trim();

  const dateReleased = (options.dateReleased || '').replace(/Z$/, '').trim();
  const amountAdvanced = Number(
    options.amountAdvanced !== undefined
      ? options.amountAdvanced
      : report.allocatedBudget || (report as any).totalAllocatedBudget || report.totalActualSpending || 0
  );
  const daysLapsed = options.daysLapsed || '-o-';

  const lineItemORs = Array.from(
    new Set(
      (report.lineItems || [])
        .map((i) => i.receiptNumber?.trim())
        .filter((n): n is string => Boolean(n && n.length > 0))
    )
  );
  const orNumber = options.orNumber || (lineItemORs.length > 0 ? lineItemORs.join(', ') : '');

  const groupedCategories = groupLiquidationData(report, options);
  const officialSignatories = resolveOfficialSignatories(report, options);

  const wb = XLSX.utils.book_new();
  const ws: any = {};

  // Styles matching LIQUIDATION-FORMAT_v1 (2) - Copy.xlsx
  const fontRegular = { name: 'Calibri', sz: 10 };
  const fontBold = { name: 'Calibri', sz: 10, bold: true };
  const fontTitle = { name: 'Calibri', sz: 11, bold: true };
  const fontSub = { name: 'Calibri', sz: 9, italic: true };

  const borderThin = {
    top: { style: 'thin', color: { rgb: '000000' } },
    bottom: { style: 'thin', color: { rgb: '000000' } },
    left: { style: 'thin', color: { rgb: '000000' } },
    right: { style: 'thin', color: { rgb: '000000' } },
  };

  const borderDoubleBottom = {
    top: { style: 'thin', color: { rgb: '000000' } },
    bottom: { style: 'double', color: { rgb: '000000' } },
    left: { style: 'thin', color: { rgb: '000000' } },
    right: { style: 'thin', color: { rgb: '000000' } },
  };

  const borderUnderline = {
    bottom: { style: 'thin', color: { rgb: '000000' } },
  };

  const numFmtCurrency = '#,##0.00';
  const numFmtVariance = '_(* #,##0.00_);_(* (#,##0.00);_(* "-"??_);_(@_)';

  // Row 1: Header Title
  ws['A1'] = {
    v: `LIQUIDATION REPORT FOR ${eventTitle}`,
    t: 's',
    s: { font: fontTitle, alignment: { horizontal: 'left', vertical: 'center' } },
  };

  // Row 2: Employee Name & Date of Activity End
  ws['A2'] = { v: `Employee Name:    ${officerName}`, t: 's', s: { font: fontRegular } };
  ws['C2'] = { v: `Date Of Activity End:     ${activityEndDate}`, t: 's', s: { font: fontRegular } };

  // Row 3: Cheque Number & Deadline
  ws['A3'] = { v: `Cheque Number:    ${chequeNumber}`, t: 's', s: { font: fontRegular } };
  ws['C3'] = { v: `Deadline For The Liquidation Submissions:     ${submissionDeadline}`, t: 's', s: { font: fontRegular } };

  // Row 4: Purpose & Date Submitted
  ws['A4'] = { v: `Purpose:     ${eventTitle}`, t: 's', s: { font: fontRegular } };
  ws['C4'] = { v: `Date Submitted:   ${dateSubmitted}`, t: 's', s: { font: fontRegular } };

  // Row 5: Amount & Days Lapse
  ws['A5'] = {
    v: `Amount:    P ${amountAdvanced.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
    t: 's',
    s: { font: fontRegular },
  };
  ws['C5'] = { v: `No. Of Days Lapse:   ${daysLapsed}`, t: 's', s: { font: fontRegular } };

  // Row 6: Date Released
  ws['A6'] = { v: `Date Released:    ${dateReleased}`, t: 's', s: { font: fontRegular } };
  ws['C6'] = { v: '', t: 's', s: { border: borderUnderline } };
  ws['D6'] = { v: '', t: 's', s: { border: borderUnderline } };

  // Row 8: CHARGE TO EXPENSE
  ws['A8'] = { v: 'CHARGE TO EXPENSE/REFUNDABLE ACCOUNT:', t: 's', s: { font: fontBold } };
  ws['C8'] = { v: '', t: 's', s: { border: borderUnderline } };
  ws['D8'] = { v: '', t: 's', s: { border: borderUnderline } };

  // Row 10: Table Top Header
  ws['A10'] = {
    v: 'PARTICULAR',
    t: 's',
    s: { font: fontBold, alignment: { horizontal: 'center', vertical: 'center' }, border: borderThin },
  };
  ws['B10'] = {
    v: 'AMOUNT',
    t: 's',
    s: { font: fontBold, alignment: { horizontal: 'center', vertical: 'center' }, border: borderThin },
  };
  ws['C10'] = {
    v: '        ACTUAL EXPENSES BREAKDOWN',
    t: 's',
    s: { font: fontBold, alignment: { horizontal: 'center', vertical: 'center' }, border: borderThin },
  };
  ws['D10'] = { v: '', t: 's', s: { border: borderThin } };
  ws['E10'] = { v: '', t: 's', s: { border: borderThin } };
  ws['F10'] = { v: '', t: 's', s: { border: borderThin } };
  ws['G10'] = {
    v: 'Remarks/Reference',
    t: 's',
    s: { font: fontBold, alignment: { horizontal: 'center', vertical: 'center' }, border: borderThin },
  };

  // Row 11: Table Sub Header
  ws['A11'] = {
    v: ' Breakdown For Cash Advances',
    t: 's',
    s: { font: fontBold, alignment: { horizontal: 'left', vertical: 'center' }, border: borderThin },
  };
  ws['B11'] = { v: '', t: 's', s: { border: borderThin } };
  ws['C11'] = { v: '', t: 's', s: { border: borderThin } };
  ws['D11'] = {
    v: 'Amount',
    t: 's',
    s: { font: fontBold, alignment: { horizontal: 'center', vertical: 'center' }, border: borderThin },
  };
  ws['E11'] = {
    v: 'Total Amount',
    t: 's',
    s: { font: fontBold, alignment: { horizontal: 'center', vertical: 'center' }, border: borderThin },
  };
  ws['F11'] = {
    v: 'Variance',
    t: 's',
    s: { font: fontBold, alignment: { horizontal: 'center', vertical: 'center' }, border: borderThin },
  };
  ws['G11'] = { v: '', t: 's', s: { border: borderThin } };

  // Row 12: Empty divider inside table
  for (let c = 0; c < 7; c++) {
    const colLetter = String.fromCharCode(65 + c);
    ws[`${colLetter}12`] = { v: '', t: 's', s: { border: borderThin } };
  }

  // Data rows start at Excel Row 13
  const categoryLetterPrefixes = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
  const firstDataRow = 13;
  let currentRow = 13;

  groupedCategories.forEach((catGroup, catIdx) => {
    const letter = categoryLetterPrefixes[catIdx] || `${catIdx + 1}`;
    const categoryParticular = `${letter}. ${catGroup.categoryTitle}`;
    const baseline = catGroup.baselineAmount;

    if (catGroup.items.length === 0) {
      const r = currentRow;
      ws[`A${r}`] = {
        v: categoryParticular,
        t: 's',
        s: { font: fontBold, alignment: { vertical: 'center', wrapText: true }, border: borderThin },
      };
      ws[`B${r}`] = {
        v: baseline > 0 ? baseline : 0,
        t: 'n',
        z: numFmtCurrency,
        s: { font: fontRegular, alignment: { horizontal: 'right', vertical: 'center' }, border: borderThin, numFmt: numFmtCurrency },
      };
      ws[`C${r}`] = {
        v: '—',
        t: 's',
        s: { font: fontRegular, alignment: { horizontal: 'center', vertical: 'center' }, border: borderThin },
      };
      ws[`D${r}`] = {
        v: 0,
        t: 'n',
        z: numFmtCurrency,
        s: { font: fontRegular, alignment: { horizontal: 'right', vertical: 'center' }, border: borderThin, numFmt: numFmtCurrency },
      };
      ws[`E${r}`] = {
        v: 0,
        t: 'n',
        z: numFmtCurrency,
        s: { font: fontRegular, alignment: { horizontal: 'right', vertical: 'center' }, border: borderThin, numFmt: numFmtCurrency },
      };
      ws[`F${r}`] = {
        f: `IF(OR(D${r}="",E${r}=""),0,D${r}-E${r})`,
        t: 'n',
        z: numFmtVariance,
        s: { font: fontRegular, alignment: { horizontal: 'center', vertical: 'center' }, border: borderThin, numFmt: numFmtVariance },
      };
      ws[`G${r}`] = { v: '', t: 's', s: { border: borderThin } };
      currentRow++;
    } else {
      catGroup.items.forEach((item, itemIdx) => {
        const r = currentRow;
        const isFirst = itemIdx === 0;

        ws[`A${r}`] = {
          v: isFirst ? categoryParticular : '',
          t: 's',
          s: { font: fontBold, alignment: { vertical: 'center', wrapText: true }, border: borderThin },
        };
        ws[`B${r}`] = isFirst && baseline > 0
          ? {
              v: baseline,
              t: 'n',
              z: numFmtCurrency,
              s: { font: fontRegular, alignment: { horizontal: 'right', vertical: 'center' }, border: borderThin, numFmt: numFmtCurrency },
            }
          : { v: '', t: 's', s: { border: borderThin } };

        ws[`C${r}`] = {
          v: item.description,
          t: 's',
          s: { font: fontRegular, alignment: { vertical: 'center', wrapText: true }, border: borderThin },
        };
        ws[`D${r}`] = {
          v: item.totalCost,
          t: 'n',
          z: numFmtCurrency,
          s: { font: fontRegular, alignment: { horizontal: 'right', vertical: 'center' }, border: borderThin, numFmt: numFmtCurrency },
        };
        ws[`E${r}`] = {
          v: item.totalCost,
          t: 'n',
          z: numFmtCurrency,
          s: { font: fontRegular, alignment: { horizontal: 'right', vertical: 'center' }, border: borderThin, numFmt: numFmtCurrency },
        };
        ws[`F${r}`] = {
          f: `IF(OR(D${r}="",E${r}=""),0,D${r}-E${r})`,
          t: 'n',
          z: numFmtVariance,
          s: { font: fontRegular, alignment: { horizontal: 'center', vertical: 'center' }, border: borderThin, numFmt: numFmtVariance },
        };
        const refText = item.receiptNumber ? `OR #${item.receiptNumber}` : (item.vendorName || '');
        ws[`G${r}`] = {
          v: refText,
          t: 's',
          s: { font: fontRegular, alignment: { horizontal: 'center', vertical: 'center' }, border: borderThin },
        };
        currentRow++;
      });
    }
  });

  // Keep official template spacing: extend grid down to at least Row 38
  const minGridEndRow = 38;
  while (currentRow <= minGridEndRow) {
    const r = currentRow;
    ['A', 'B', 'C', 'D', 'E', 'F', 'G'].forEach((col) => {
      ws[`${col}${r}`] = { v: '', t: 's', s: { border: borderThin } };
    });
    currentRow++;
  }

  const lastDataRow = currentRow - 1;
  const totalsRow = currentRow;

  // Totals Row
  ws[`A${totalsRow}`] = {
    v: 'Total Cash Advance',
    t: 's',
    s: { font: fontBold, alignment: { horizontal: 'left', vertical: 'center' }, border: borderDoubleBottom },
  };
  ws[`B${totalsRow}`] = {
    f: `SUM(B${firstDataRow}:B${lastDataRow})`,
    t: 'n',
    z: numFmtCurrency,
    s: { font: fontBold, alignment: { horizontal: 'right', vertical: 'center' }, border: borderDoubleBottom, numFmt: numFmtCurrency },
  };
  ws[`C${totalsRow}`] = {
    v: 'Total Actual Expense',
    t: 's',
    s: { font: fontBold, alignment: { horizontal: 'left', vertical: 'center' }, border: borderDoubleBottom },
  };
  ws[`D${totalsRow}`] = { v: '', t: 's', s: { border: borderDoubleBottom } };
  ws[`E${totalsRow}`] = {
    f: `SUM(E${firstDataRow}:E${lastDataRow})`,
    t: 'n',
    z: numFmtCurrency,
    s: { font: fontBold, alignment: { horizontal: 'right', vertical: 'center' }, border: borderDoubleBottom, numFmt: numFmtCurrency },
  };
  ws[`F${totalsRow}`] = {
    f: `B${totalsRow}-E${totalsRow}`,
    t: 'n',
    z: numFmtVariance,
    s: { font: fontBold, alignment: { horizontal: 'center', vertical: 'center' }, border: borderDoubleBottom, numFmt: numFmtVariance },
  };
  ws[`G${totalsRow}`] = { v: '', t: 's', s: { border: borderDoubleBottom } };
  currentRow++;

  // Note block (spacing 3 rows matching template)
  currentRow += 3;
  const noteRow = currentRow;
  ws[`A${noteRow}`] = { v: 'Note: ', t: 's', s: { font: fontBold } };
  currentRow++;

  const advRow = currentRow;
  ws[`A${advRow}`] = { v: '             Amount Advanced:', t: 's', s: { font: fontRegular } };
  ws[`B${advRow}`] = {
    f: `B${totalsRow}`,
    t: 'n',
    z: numFmtCurrency,
    s: { font: fontRegular, alignment: { horizontal: 'right' }, numFmt: numFmtCurrency },
  };
  currentRow++;

  const expRow = currentRow;
  ws[`A${expRow}`] = { v: '          Total Actual Expense', t: 's', s: { font: fontRegular } };
  ws[`B${expRow}`] = {
    f: `E${totalsRow}`,
    t: 'n',
    z: numFmtCurrency,
    s: { font: fontRegular, alignment: { horizontal: 'right' }, numFmt: numFmtCurrency },
  };
  currentRow++;

  const balRow = currentRow;
  ws[`A${balRow}`] = { v: '          Balance: ', t: 's', s: { font: fontBold } };
  ws[`B${balRow}`] = {
    f: `B${advRow}-B${expRow}`,
    t: 'n',
    z: numFmtCurrency,
    s: { font: fontBold, alignment: { horizontal: 'right' }, numFmt: numFmtCurrency },
  };
  ws[`C${balRow}`] = { v: `OR NO: ${orNumber}`, t: 's', s: { font: fontRegular } };
  currentRow++;

  // Signatures block matching Rows 55-76
  currentRow += 2;
  officialSignatories.forEach((sig) => {
    const nameRow = currentRow;
    ws[`A${nameRow}`] = { v: sig.type, t: 's', s: { font: fontBold } };
    ws[`C${nameRow}`] = {
      v: sig.name,
      t: 's',
      s: { font: fontBold, alignment: { horizontal: 'center' }, border: borderUnderline },
    };
    ws[`E${nameRow}`] = {
      v: sig.date || '',
      t: 's',
      s: { font: fontRegular, alignment: { horizontal: 'center' }, border: borderUnderline },
    };
    currentRow++;

    const roleRow = currentRow;
    ws[`B${roleRow}`] = { v: sig.role, t: 's', s: { font: fontSub, alignment: { horizontal: 'center' } } };
    ws[`E${roleRow}`] = { v: '(Date)', t: 's', s: { font: fontSub, alignment: { horizontal: 'center' } } };
    currentRow += 2; // divider spacing
  });

  ws['!ref'] = `A1:G${currentRow}`;

  // Column widths matching LIQUIDATION-FORMAT_v1 (2) - Copy.xlsx
  ws['!cols'] = [
    { wch: 38 }, // Col A: PARTICULAR & Breakdown For Cash Advances
    { wch: 12 }, // Col B: AMOUNT
    { wch: 35 }, // Col C: ACTUAL EXPENSES BREAKDOWN
    { wch: 12 }, // Col D: Amount
    { wch: 12 }, // Col E: Total Amount
    { wch: 11 }, // Col F: Variance
    { wch: 26 }, // Col G: Remarks/Reference
  ];

  // Merged headers matching template
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }, // Row 1 Title (A1:G1)
    { s: { r: 9, c: 2 }, e: { r: 9, c: 4 } }, // Row 10 ACTUAL EXPENSES BREAKDOWN (C10:E10)
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Liquidation Format');

  const cleanFilename = eventTitle.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 35);
  XLSX.writeFile(wb, `${cleanFilename}_Official_STI_Liquidation.xlsx`);
}

/**
 * Exports to XML Spreadsheet 2003 (.xls) with full borders and styling
 */
export function exportOfficialStiLiquidationXml(
  report: LiquidationDocument,
  options: StiLiquidationExcelOptions = {}
) {
  const eventTitle = report.eventTitle || 'Event Activity';
  const officerName = options.officerName || report.submittedByName || report.createdByName || '';
  const chequeNumber =
    options.chequeNumber ||
    (report as any).chequeNumber ||
    (report as any).checkNumber ||
    (report.id ? report.id.slice(0, 8).toUpperCase() : '');

  const rawEndDate = options.activityEndDate || formatAppDate(report.createdAt, '');
  const activityEndDate = rawEndDate.replace(/Z$/, '').trim();

  let fallbackDeadline = '';
  const parsedEnd = parseDateSafe(activityEndDate || report.createdAt);
  if (parsedEnd) {
    const deadDate = new Date(parsedEnd.getTime() + 15 * 24 * 60 * 60 * 1000);
    fallbackDeadline = formatAppDate(deadDate, '');
  }
  const submissionDeadline = (options.submissionDeadline || fallbackDeadline).replace(/Z$/, '').trim();

  const rawSubmitted =
    options.dateSubmitted ||
    formatAppDate(report.submittedAt || report.createdAt, new Date().toLocaleDateString());
  const dateSubmitted = rawSubmitted.replace(/Z$/, '').trim();

  const dateReleased = (options.dateReleased || '').replace(/Z$/, '').trim();
  const amountAdvanced = Number(
    options.amountAdvanced !== undefined
      ? options.amountAdvanced
      : report.allocatedBudget || (report as any).totalAllocatedBudget || report.totalActualSpending || 0
  );
  const daysLapsed = options.daysLapsed || '-o-';

  const lineItemORs = Array.from(
    new Set(
      (report.lineItems || [])
        .map((i) => i.receiptNumber?.trim())
        .filter((n): n is string => Boolean(n && n.length > 0))
    )
  );
  const orNumber = options.orNumber || (lineItemORs.length > 0 ? lineItemORs.join(', ') : '');

  const groupedCategories = groupLiquidationData(report, options);
  const officialSignatories = resolveOfficialSignatories(report, options);

  const categoryLetterPrefixes = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
  let currentRow = 13;
  let expenseRowsXml = '';

  groupedCategories.forEach((catGroup, catIdx) => {
    const letter = categoryLetterPrefixes[catIdx] || `${catIdx + 1}`;
    const categoryTitle = `${letter}. ${catGroup.categoryTitle}`;
    const baseline = catGroup.baselineAmount;

    if (catGroup.items.length === 0) {
      const r = currentRow++;
      expenseRowsXml += `
   <Row ss:Index="${r}">
    <Cell ss:StyleID="CategoryCell"><Data ss:Type="String">${escapeXml(categoryTitle)}</Data></Cell>
    <Cell ss:StyleID="CurrencyCell">${baseline > 0 ? `<Data ss:Type="Number">${baseline}</Data>` : '<Data ss:Type="String"></Data>'}</Cell>
    <Cell ss:StyleID="ItemDescCell"><Data ss:Type="String">—</Data></Cell>
    <Cell ss:StyleID="CurrencyCell"><Data ss:Type="Number">0</Data></Cell>
    <Cell ss:StyleID="CurrencyCell"><Data ss:Type="Number">0</Data></Cell>
    <Cell ss:StyleID="CurrencyCell" ss:Formula="=RC[-2]-RC[-1]"><Data ss:Type="Number">0</Data></Cell>
    <Cell ss:StyleID="BorderedText"><Data ss:Type="String"></Data></Cell>
   </Row>`;
    } else {
      catGroup.items.forEach((item, itemIdx) => {
        const r = currentRow++;
        const isFirst = itemIdx === 0;

        const particularColA = isFirst ? categoryTitle : '';
        const particularAmount = isFirst ? (baseline > 0 ? baseline : '') : '';
        const itemDesc = item.description;
        const itemAmount = item.totalCost;
        const remarks = item.receiptNumber ? `OR #${item.receiptNumber}` : (item.vendorName || '');

        expenseRowsXml += `
   <Row ss:Index="${r}">
    <Cell ss:StyleID="${isFirst ? 'CategoryCell' : 'BorderedText'}"><Data ss:Type="String">${escapeXml(particularColA)}</Data></Cell>
    <Cell ss:StyleID="${isFirst ? 'CurrencyCell' : 'BorderedText'}">${particularAmount !== '' ? `<Data ss:Type="Number">${particularAmount}</Data>` : '<Data ss:Type="String"></Data>'}</Cell>
    <Cell ss:StyleID="ItemDescCell"><Data ss:Type="String">${escapeXml(itemDesc)}</Data></Cell>
    <Cell ss:StyleID="CurrencyCell"><Data ss:Type="Number">${itemAmount}</Data></Cell>
    <Cell ss:StyleID="CurrencyCell"><Data ss:Type="Number">${itemAmount}</Data></Cell>
    <Cell ss:StyleID="CurrencyCell" ss:Formula="=RC[-2]-RC[-1]"><Data ss:Type="Number">0</Data></Cell>
    <Cell ss:StyleID="BorderedText"><Data ss:Type="String">${escapeXml(remarks)}</Data></Cell>
   </Row>`;
      });
    }
  });

  const totalsRow = currentRow++;
  const firstDataRow = 13;
  const lastDataRow = totalsRow - 1;

  const totalAdvanceFormula = `=SUM(R${firstDataRow}C2:R${lastDataRow}C2)`;
  const totalActualFormula = `=SUM(R${firstDataRow}C5:R${lastDataRow}C5)`;
  const varianceFormula = `=R${totalsRow}C2-R${totalsRow}C5`;

  const noteHeaderRow = totalsRow + 3;
  const amountAdvancedRow = noteHeaderRow + 1;
  const actualExpenseSummaryRow = amountAdvancedRow + 1;
  const balanceRow = actualExpenseSummaryRow + 1;

  let signaturesXml = '';
  let sigStartRow = balanceRow + 3;
  officialSignatories.forEach((sig) => {
    const titleRow = sigStartRow++;
    const roleRow = sigStartRow++;
    sigStartRow++; // spacing

    signaturesXml += `
   <Row ss:Index="${titleRow}">
    <Cell ss:StyleID="SigHeader"><Data ss:Type="String">${escapeXml(sig.type)}</Data></Cell>
    <Cell ss:StyleID="Default"/>
    <Cell ss:StyleID="SigNameUnderline"><Data ss:Type="String">${escapeXml(sig.name)}</Data></Cell>
    <Cell ss:StyleID="Default"/>
    <Cell ss:StyleID="SigDateText"><Data ss:Type="String">${escapeXml(sig.date || '')}</Data></Cell>
   </Row>
   <Row ss:Index="${roleRow}">
    <Cell ss:StyleID="Default"/>
    <Cell ss:StyleID="SigRoleText"><Data ss:Type="String">${escapeXml(sig.role)}</Data></Cell>
    <Cell ss:StyleID="Default"/>
    <Cell ss:StyleID="Default"/>
    <Cell ss:StyleID="SigDateText"><Data ss:Type="String">(Date)</Data></Cell>
   </Row>`;
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
  <Author>STI Sync Platform</Author>
  <LastAuthor>STI Sync Platform</LastAuthor>
  <Created>${new Date().toISOString()}</Created>
  <Company>STI College</Company>
  <Version>16.00</Version>
 </DocumentProperties>
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Center"/>
   <Borders/>
   <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#000000"/>
   <Interior/>
   <NumberFormat/>
   <Protection/>
  </Style>

  <Style ss:ID="MainTitle">
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="14" ss:Bold="1" ss:Color="#000000"/>
  </Style>

  <Style ss:ID="MetaLabel">
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#000000"/>
  </Style>
  <Style ss:ID="MetaValue">
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#000000"/>
  </Style>
  <Style ss:ID="SubHeader">
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#000000"/>
  </Style>

  <Style ss:ID="TableHeaderTop">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
   </Borders>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#000000"/>
  </Style>

  <Style ss:ID="TableHeaderSub">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
   </Borders>
   <Font ss:FontName="Calibri" ss:Size="9" ss:Bold="1" ss:Color="#000000"/>
  </Style>

  <Style ss:ID="CategoryCell">
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
   </Borders>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#000000"/>
  </Style>

  <Style ss:ID="ItemDescCell">
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
   </Borders>
   <Font ss:FontName="Calibri" ss:Size="9.5" ss:Color="#000000"/>
  </Style>

  <Style ss:ID="CurrencyCell">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
   </Borders>
   <Font ss:FontName="Calibri" ss:Size="9.5" ss:Color="#000000"/>
   <NumberFormat ss:Format="#,##0.00"/>
  </Style>

  <Style ss:ID="BorderedText">
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
   </Borders>
   <Font ss:FontName="Calibri" ss:Size="9" ss:Color="#000000"/>
  </Style>

  <Style ss:ID="TotalLabel">
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#000000"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#000000"/>
   </Borders>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#000000"/>
  </Style>

  <Style ss:ID="TotalAmountCell">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#000000"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#000000"/>
   </Borders>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#000000"/>
   <NumberFormat ss:Format="#,##0.00"/>
  </Style>

  <Style ss:ID="BalanceSummaryLabel">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#000000"/>
  </Style>

  <Style ss:ID="BalanceSummaryValue">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Double" ss:Weight="3" ss:Color="#000000"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
   </Borders>
   <Font ss:FontName="Calibri" ss:Size="10.5" ss:Bold="1" ss:Color="#000000"/>
   <NumberFormat ss:Format="#,##0.00"/>
  </Style>

  <Style ss:ID="SigHeader">
   <Alignment ss:Horizontal="Left" ss:Vertical="Bottom"/>
   <Font ss:FontName="Calibri" ss:Size="9.5" ss:Bold="1" ss:Color="#000000"/>
  </Style>
  <Style ss:ID="SigNameUnderline">
   <Alignment ss:Horizontal="Center" ss:Vertical="Bottom"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
   </Borders>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#000000"/>
  </Style>
  <Style ss:ID="SigRoleText">
   <Alignment ss:Horizontal="Center" ss:Vertical="Top"/>
   <Font ss:FontName="Calibri" ss:Size="9" ss:Color="#000000"/>
  </Style>
  <Style ss:ID="SigDateText">
   <Alignment ss:Horizontal="Right" ss:Vertical="Top"/>
   <Font ss:FontName="Calibri" ss:Size="8" ss:Color="#555555"/>
  </Style>
 </Styles>

 <Worksheet ss:Name="Liquidation Format">
  <Table ss:ExpandedColumnCount="8" x:FullColumns="1" x:FullRows="1" ss:DefaultRowHeight="16">
   <Column ss:Index="1" ss:AutoFitWidth="0" ss:Width="160"/>
   <Column ss:Index="2" ss:AutoFitWidth="0" ss:Width="100"/>
   <Column ss:Index="3" ss:AutoFitWidth="0" ss:Width="200"/>
   <Column ss:Index="4" ss:AutoFitWidth="0" ss:Width="90"/>
   <Column ss:Index="5" ss:AutoFitWidth="0" ss:Width="95"/>
   <Column ss:Index="6" ss:AutoFitWidth="0" ss:Width="90"/>
   <Column ss:Index="7" ss:AutoFitWidth="0" ss:Width="130"/>

   <Row ss:Index="1" ss:Height="24">
    <Cell ss:MergeAcross="6" ss:StyleID="MainTitle">
     <Data ss:Type="String">LIQUIDATION REPORT FOR ${escapeXml(eventTitle)}</Data>
    </Cell>
   </Row>

   <Row ss:Index="2">
    <Cell ss:StyleID="MetaLabel"><Data ss:Type="String">Employee Name:</Data></Cell>
    <Cell ss:StyleID="MetaValue"><Data ss:Type="String">${escapeXml(officerName)}</Data></Cell>
    <Cell ss:StyleID="MetaLabel"><Data ss:Type="String">Date Of Activity End:</Data></Cell>
    <Cell ss:MergeAcross="3" ss:StyleID="MetaValue"><Data ss:Type="String">${escapeXml(activityEndDate)}</Data></Cell>
   </Row>

   <Row ss:Index="3">
    <Cell ss:StyleID="MetaLabel"><Data ss:Type="String">Cheque Number:</Data></Cell>
    <Cell ss:StyleID="MetaValue"><Data ss:Type="String">${escapeXml(chequeNumber)}</Data></Cell>
    <Cell ss:StyleID="MetaLabel"><Data ss:Type="String">Deadline For The Liquidation Submissions:</Data></Cell>
    <Cell ss:MergeAcross="3" ss:StyleID="MetaValue"><Data ss:Type="String">${escapeXml(submissionDeadline)}</Data></Cell>
   </Row>

   <Row ss:Index="4">
    <Cell ss:StyleID="MetaLabel"><Data ss:Type="String">Purpose:</Data></Cell>
    <Cell ss:StyleID="MetaValue"><Data ss:Type="String">${escapeXml(eventTitle)}</Data></Cell>
    <Cell ss:StyleID="MetaLabel"><Data ss:Type="String">Date Submitted:</Data></Cell>
    <Cell ss:MergeAcross="3" ss:StyleID="MetaValue"><Data ss:Type="String">${escapeXml(dateSubmitted)}</Data></Cell>
   </Row>

   <Row ss:Index="5">
    <Cell ss:StyleID="MetaLabel"><Data ss:Type="String">Amount:</Data></Cell>
    <Cell ss:StyleID="CurrencyCell"><Data ss:Type="Number">${amountAdvanced}</Data></Cell>
    <Cell ss:StyleID="MetaLabel"><Data ss:Type="String">No. Of Days Lapse:</Data></Cell>
    <Cell ss:MergeAcross="3" ss:StyleID="MetaValue"><Data ss:Type="String">${escapeXml(daysLapsed)}</Data></Cell>
   </Row>

   <Row ss:Index="6">
    <Cell ss:StyleID="MetaLabel"><Data ss:Type="String">Date Released:</Data></Cell>
    <Cell ss:StyleID="MetaValue"><Data ss:Type="String">${escapeXml(dateReleased)}</Data></Cell>
    <Cell ss:MergeAcross="4" ss:StyleID="Default"/>
   </Row>

   <Row ss:Index="8">
    <Cell ss:MergeAcross="6" ss:StyleID="SubHeader">
     <Data ss:Type="String">CHARGE TO EXPENSE/REFUNDABLE ACCOUNT:</Data>
    </Cell>
   </Row>

   <Row ss:Index="10" ss:Height="20">
    <Cell ss:StyleID="TableHeaderTop"><Data ss:Type="String">PARTICULAR</Data></Cell>
    <Cell ss:StyleID="TableHeaderTop"><Data ss:Type="String">AMOUNT</Data></Cell>
    <Cell ss:MergeAcross="3" ss:StyleID="TableHeaderTop"><Data ss:Type="String">        ACTUAL EXPENSES BREAKDOWN</Data></Cell>
    <Cell ss:StyleID="TableHeaderTop"><Data ss:Type="String">Remarks/Reference</Data></Cell>
   </Row>

   <Row ss:Index="11" ss:Height="18">
    <Cell ss:StyleID="TableHeaderSub"><Data ss:Type="String"> Breakdown For Cash Advances</Data></Cell>
    <Cell ss:StyleID="TableHeaderSub"><Data ss:Type="String"></Data></Cell>
    <Cell ss:StyleID="TableHeaderSub"><Data ss:Type="String"></Data></Cell>
    <Cell ss:StyleID="TableHeaderSub"><Data ss:Type="String">Amount</Data></Cell>
    <Cell ss:StyleID="TableHeaderSub"><Data ss:Type="String">Total Amount</Data></Cell>
    <Cell ss:StyleID="TableHeaderSub"><Data ss:Type="String">Variance</Data></Cell>
    <Cell ss:StyleID="TableHeaderSub"><Data ss:Type="String"></Data></Cell>
   </Row>

   ${expenseRowsXml}

   <Row ss:Index="${totalsRow}" ss:Height="20">
    <Cell ss:StyleID="TotalLabel"><Data ss:Type="String">Total Cash Advance</Data></Cell>
    <Cell ss:StyleID="TotalAmountCell" ss:Formula="${totalAdvanceFormula}"><Data ss:Type="Number">${amountAdvanced}</Data></Cell>
    <Cell ss:StyleID="TotalLabel"><Data ss:Type="String">Total Actual Expense</Data></Cell>
    <Cell ss:StyleID="Default"/>
    <Cell ss:StyleID="TotalAmountCell" ss:Formula="${totalActualFormula}"><Data ss:Type="Number">${report.totalActualSpending || (report as any).totalActualSpent || 0}</Data></Cell>
    <Cell ss:StyleID="TotalAmountCell" ss:Formula="${varianceFormula}"><Data ss:Type="Number">${(amountAdvanced - (report.totalActualSpending || (report as any).totalActualSpent || 0))}</Data></Cell>
    <Cell ss:StyleID="Default"/>
   </Row>

   <Row ss:Index="${noteHeaderRow}">
    <Cell ss:StyleID="MetaLabel"><Data ss:Type="String">Note: </Data></Cell>
    <Cell ss:MergeAcross="5" ss:StyleID="Default"/>
   </Row>

   <Row ss:Index="${amountAdvancedRow}">
    <Cell ss:StyleID="BalanceSummaryLabel"><Data ss:Type="String">             Amount Advanced:</Data></Cell>
    <Cell ss:StyleID="CurrencyCell" ss:Formula="=R${totalsRow}C2"><Data ss:Type="Number">${amountAdvanced}</Data></Cell>
    <Cell ss:MergeAcross="4" ss:StyleID="Default"/>
   </Row>

   <Row ss:Index="${actualExpenseSummaryRow}">
    <Cell ss:StyleID="BalanceSummaryLabel"><Data ss:Type="String">          Total Actual Expense</Data></Cell>
    <Cell ss:StyleID="CurrencyCell" ss:Formula="=R${totalsRow}C5"><Data ss:Type="Number">${report.totalActualSpending || (report as any).totalActualSpent || 0}</Data></Cell>
    <Cell ss:MergeAcross="4" ss:StyleID="Default"/>
   </Row>

   <Row ss:Index="${balanceRow}" ss:Height="20">
    <Cell ss:StyleID="BalanceSummaryLabel"><Data ss:Type="String">          Balance: </Data></Cell>
    <Cell ss:StyleID="BalanceSummaryValue" ss:Formula="=R${amountAdvancedRow}C2-R${actualExpenseSummaryRow}C2"><Data ss:Type="Number">${(amountAdvanced - (report.totalActualSpending || (report as any).totalActualSpent || 0))}</Data></Cell>
    <Cell ss:StyleID="MetaLabel"><Data ss:Type="String">OR NO: ${escapeXml(orNumber)}</Data></Cell>
    <Cell ss:MergeAcross="3" ss:StyleID="Default"/>
   </Row>

   ${signaturesXml}

  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
   <PageSetup>
    <Layout x:Orientation="Portrait"/>
    <Header x:Margin="0.3"/>
    <Footer x:Margin="0.3"/>
    <PageMargins x:Bottom="0.75" x:Left="0.7" x:Right="0.7" x:Top="0.75"/>
   </PageSetup>
  </WorksheetOptions>
 </Worksheet>
</Workbook>`;

  const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const cleanFilename = eventTitle.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 35);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${cleanFilename}_Official_STI_Liquidation.xls`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Main export handler: Defaults to official .xlsx (matching LIQUIDATION-FORMAT_v1 (2) - Copy.xlsx)
 */
export function exportOfficialStiLiquidationExcel(
  report: LiquidationDocument,
  options: StiLiquidationExcelOptions = {}
) {
  if (options.exportFormat === 'xls') {
    return exportOfficialStiLiquidationXml(report, options);
  }
  return exportOfficialStiLiquidationXlsx(report, options);
}
