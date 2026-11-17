import { useState, useEffect, useMemo } from 'react';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import type { ActivityProposal, ProposalBucketAllocation, SurplusReturnAllocation, DeficitDeductionAllocation } from '../../activity-proposals/types/proposal.types';
import type { DisbursementVoucherAttachment, ExpenseLineItem, LiquidationDocument, ReceiptAttachment } from '../../finance/types/liquidation.types';
import type { PostActivityReportDocument } from '../types/par.types';
import { fetchLinkedActivityProposal } from '../services/par.service';
import { peekCachedEventsById } from '../../events/hooks/useEventStream';
import { peekCachedProposalById } from '../../activity-proposals/services/proposal.service';
import { peekCachedLiquidationByEventId, peekCachedLiquidationById } from '../../finance/hooks/useLiquidationStream';
import { MISC_FEE_LEDGER_COLLECTION } from '../../finance/services/misc-fee.service';
import { RETAINED_FUND_LEDGER_COLLECTION } from '../../finance/services/retained-fund.service';

export interface PARNormalizedReceiptProof {
  id: string;
  name: string;
  url: string;
  category: string;
  fileType?: string;
  itemDescription?: string;
  vendorName?: string;
  receiptNumber?: string;
  isLostReceipt?: boolean;
}

export interface PARActivityLedgerTransaction {
  id: string;
  source: 'misc_fee_ledger' | 'retained_fund_ledger' | 'sao_ledger' | 'organization_ledger' | 'derived';
  dateLabel: string;
  timestampMs: number;
  category: 'disbursement' | 'expense' | 'surplus_return' | 'deficit_coverage' | 'other';
  bucketName: string;
  description: string;
  amount: number;
  direction: 'in' | 'out';
  referenceNo?: string;
  performedBy?: string;
  isSupplemental?: boolean;
}

export interface PARAnticipatedItem {
  description: string;
  quantity: number;
  unitAmount: number;
  totalAmount: number;
}

function normalizeReceiptsFromLineItem(item: ExpenseLineItem, itemIdx: number): PARNormalizedReceiptProof[] {
  const itemDesc = item.description || item.category || `Expense Item #${itemIdx + 1}`;
  const tag = item.isLostReceipt ? 'Lost Receipt / Affidavit' : 'Official Receipt';
  if (Array.isArray(item.receiptFiles) && item.receiptFiles.length > 0) {
    return item.receiptFiles.map((rf, fIdx) => ({
      id: rf.id || `fl-rec-${itemIdx}-${fIdx}`,
      name: rf.name || `${itemDesc} (${tag})`,
      url: rf.url,
      category: tag,
      fileType: rf.fileType,
      itemDescription: itemDesc,
      vendorName: item.vendorName,
      receiptNumber: item.receiptNumber,
      isLostReceipt: Boolean(item.isLostReceipt),
    }));
  }
  if (Array.isArray(item.receiptUrls) && item.receiptUrls.length > 0) {
    return item.receiptUrls.map((url, uIdx) => ({
      id: `fl-url-${itemIdx}-${uIdx}`,
      name: `${itemDesc} (${tag} ${uIdx + 1})`,
      url,
      category: tag,
      fileType: /\.pdf(\?|#|$)/i.test(url) ? 'pdf' : 'image',
      itemDescription: itemDesc,
      vendorName: item.vendorName,
      receiptNumber: item.receiptNumber,
      isLostReceipt: Boolean(item.isLostReceipt),
    }));
  }
  if (item.receiptUrl) {
    return [
      {
        id: `fl-legacy-${itemIdx}`,
        name: `${itemDesc} (${tag})`,
        url: item.receiptUrl,
        category: tag,
        fileType: /\.pdf(\?|#|$)/i.test(item.receiptUrl) ? 'pdf' : 'image',
        itemDescription: itemDesc,
        vendorName: item.vendorName,
        receiptNumber: item.receiptNumber,
        isLostReceipt: Boolean(item.isLostReceipt),
      },
    ];
  }
  return [];
}

function toTimestampMs(val: any): number {
  if (!val) return 0;
  if (typeof val?.toDate === 'function') return val.toDate().getTime();
  if (typeof val?.seconds === 'number') return val.seconds * 1000;
  const parsed = new Date(val);
  return isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function formatShortTxDate(val: any): string {
  const ms = toTimestampMs(val);
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function extractProposalAnticipatedItems(proposal: ActivityProposal | null | undefined, eventDoc?: any): {
  anticipatedExpenses: number;
  anticipatedLineItems: PARAnticipatedItem[];
} {
  const fp = (proposal as any)?.financialProjections || eventDoc?.financialProjections;
  const rawItems: any[] =
    (Array.isArray((proposal as any)?.lineItems) && (proposal as any).lineItems.length > 0 && (proposal as any).lineItems) ||
    (Array.isArray(fp?.expenses) && fp.expenses.length > 0 && fp.expenses) ||
    (Array.isArray(eventDoc?.lineItems) && eventDoc.lineItems.length > 0 && eventDoc.lineItems) ||
    (Array.isArray(eventDoc?.budgetItems) && eventDoc.budgetItems.length > 0 && eventDoc.budgetItems) ||
    [];

  const anticipatedLineItems: PARAnticipatedItem[] = rawItems.map((it: any, idx: number) => {
    const qty = Math.max(1, Number(it.quantity ?? 1) || 1);
    const totalAmount = Number(
      it.totalCost ?? it.totalAmount ?? it.total ?? it.approvedAmount ?? (qty * Number(it.unitCost ?? it.unitPrice ?? it.unitAmount ?? 0)) ?? 0
    ) || 0;
    const unitAmount = Number(it.unitCost ?? it.unitPrice ?? it.unitAmount ?? (qty > 0 ? totalAmount / qty : totalAmount)) || 0;
    return {
      description: String(it.particulars || it.description || it.itemName || it.item || `Projected Expense #${idx + 1}`),
      quantity: qty,
      unitAmount: Math.round(unitAmount * 100) / 100,
      totalAmount: Math.round(totalAmount * 100) / 100,
    };
  });

  const itemSum = anticipatedLineItems.reduce((s, i) => s + i.totalAmount, 0);
  const explicitTotal = Number(
    fp?.totalExpenses ??
      fp?.totalEstimatedExpenses ??
      (proposal as any)?.totalExpenseAmount ??
      (proposal as any)?.totalProposedBudget ??
      (proposal as any)?.allocatedBudget ??
      eventDoc?.totalApprovedBudget ??
      0
  ) || 0;

  return {
    anticipatedExpenses: explicitTotal > 0 ? explicitTotal : Math.round(itemSum * 100) / 100,
    anticipatedLineItems,
  };
}

export function usePARActivityFinancials(params: {
  isOpen: boolean;
  report?: PostActivityReportDocument | null;
  preloadedEvent?: any;
  preloadedProposal?: ActivityProposal | null;
  preloadedLiquidation?: LiquidationDocument | null;
}) {
  const { isOpen, report, preloadedEvent, preloadedProposal, preloadedLiquidation } = params;
  const [linkedEvent, setLinkedEvent] = useState<any>(preloadedEvent || null);
  const [linkedProposal, setLinkedProposal] = useState<ActivityProposal | null>(preloadedProposal || null);
  const [linkedLiquidation, setLinkedLiquidation] = useState<LiquidationDocument | null>(preloadedLiquidation || null);
  const [ledgerTransactions, setLedgerTransactions] = useState<PARActivityLedgerTransaction[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (preloadedEvent) setLinkedEvent(preloadedEvent);
  }, [preloadedEvent]);

  useEffect(() => {
    if (preloadedProposal) setLinkedProposal(preloadedProposal);
  }, [preloadedProposal]);

  useEffect(() => {
    if (preloadedLiquidation) setLinkedLiquidation(preloadedLiquidation);
  }, [preloadedLiquidation]);

  useEffect(() => {
    if (!isOpen || !report) return;
    let cancelled = false;

    const hydrate = async () => {
      setLoading(true);
      try {
        // 1. Event
        let evDoc = preloadedEvent || (report.eventId ? peekCachedEventsById(report.eventId) : null);
        if (!evDoc && report.eventId) {
          for (const colName of ['events', 'activities', 'activity_proposals', 'proposals']) {
            try {
              const snap = await getDoc(doc(db, colName, report.eventId));
              if (snap.exists()) {
                evDoc = { id: snap.id, ...snap.data() };
                break;
              }
            } catch {}
          }
        }
        if (!cancelled) setLinkedEvent(evDoc || null);

        // 2. Activity Proposal
        let propDoc: ActivityProposal | null = preloadedProposal || null;
        if (!propDoc) {
          const directPropId = evDoc?.proposalId || evDoc?.activityProposalId || report.eventId;
          if (directPropId) propDoc = peekCachedProposalById(directPropId);
          if (!propDoc) {
            try {
              propDoc = await fetchLinkedActivityProposal(
                evDoc || { referenceId: report.eventReferenceId },
                report.eventId
              );
            } catch {}
          }
          if (!propDoc && evDoc && (evDoc.title || evDoc.financialProjections || evDoc.lineItems)) {
            propDoc = evDoc as ActivityProposal;
          }
        }
        if (!cancelled) setLinkedProposal(propDoc || null);

        // 3. Financial Liquidation
        let liqDoc: LiquidationDocument | null = preloadedLiquidation || null;
        if (!liqDoc) {
          const candidateIds = Array.from(
            new Set(
              [
                report.liquidationId,
                evDoc?.liquidationReportId,
                evDoc?.liquidationId,
                (propDoc as any)?.liquidationReportId,
                (propDoc as any)?.liquidationId,
              ].filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
            )
          );
          for (const id of candidateIds) {
            const cached = peekCachedLiquidationById(id);
            if (cached) {
              liqDoc = cached;
              break;
            }
          }
          if (!liqDoc && report.eventId) {
            liqDoc = peekCachedLiquidationByEventId(report.eventId);
          }
          if (!liqDoc) {
            for (const id of candidateIds) {
              for (const colName of ['liquidations', 'financial_liquidations']) {
                try {
                  const snap = await getDoc(doc(db, colName, id));
                  if (snap.exists()) {
                    liqDoc = { id: snap.id, ...snap.data() } as LiquidationDocument;
                    break;
                  }
                } catch {}
              }
              if (liqDoc) break;
            }
          }
          if (!liqDoc && report.eventId) {
            for (const colName of ['liquidations', 'financial_liquidations']) {
              try {
                const q = query(collection(db, colName), where('eventId', '==', report.eventId));
                const qSnap = await getDocs(q);
                const docs = qSnap.docs
                  .map((d) => ({ id: d.id, ...d.data() } as any))
                  .filter((d) => d.isDeleted !== true && d.status !== 'voided');
                if (docs.length > 0) {
                  liqDoc =
                    docs.find((d) => d.status === 'approved') ||
                    docs.find((d) => d.status === 'under_review') ||
                    docs[0];
                  break;
                }
              } catch {}
            }
          }
        }
        if (!cancelled) setLinkedLiquidation(liqDoc || null);

        // 4. Persisted Activity Ledger Transactions (Misc Fee, Retained Fund, SAO & Org Ledgers)
        const txRows: PARActivityLedgerTransaction[] = [];
        const seenTxKeys = new Set<string>();
        const targetEventId = report.eventId;
        const targetLiqId = liqDoc?.id || report.liquidationId;

        const addTx = (tx: PARActivityLedgerTransaction) => {
          const dedupKey = `${tx.source}:${tx.id}`;
          if (seenTxKeys.has(dedupKey)) return;
          seenTxKeys.add(dedupKey);
          txRows.push(tx);
        };

        if (targetEventId) {
          try {
            const miscQ = query(collection(db, MISC_FEE_LEDGER_COLLECTION), where('eventId', '==', targetEventId));
            const miscSnap = await getDocs(miscQ);
            miscSnap.forEach((d) => {
              const m = d.data() as any;
              const type = String(m.type || '');
              const isIn = type === 'liquidation_surplus_return' || type === 'disbursement_reversal';
              const category: PARActivityLedgerTransaction['category'] =
                type === 'disbursement_deduction'
                  ? 'disbursement'
                  : type === 'liquidation_surplus_return'
                    ? 'surplus_return'
                    : type === 'liquidation_deficit_deduction'
                      ? 'deficit_coverage'
                      : 'other';
              addTx({
                id: d.id,
                source: 'misc_fee_ledger',
                dateLabel: formatShortTxDate(m.createdAt),
                timestampMs: toTimestampMs(m.createdAt),
                category,
                bucketName: m.bucketName || 'Miscellaneous Fee',
                description:
                  type === 'disbursement_deduction'
                    ? `Disbursement Voucher Pull (${m.bucketName || 'Misc Fee'})`
                    : type === 'liquidation_surplus_return'
                      ? `Unspent Surplus Returned to ${m.bucketName || 'Misc Fee'}`
                      : type === 'liquidation_deficit_deduction'
                        ? `Overspend Covered by ${m.bucketName || 'Misc Fee'}${m.isSupplementalSource ? ' (Supplemental)' : ''}`
                        : m.eventTitle || type,
                amount: Number(m.amount) || 0,
                direction: isIn ? 'in' : 'out',
                referenceNo: m.chequeNumber || '',
                performedBy: m.performedBy || '',
                isSupplemental: Boolean(m.isSupplementalSource),
              });
            });
          } catch {}

          try {
            const retQ = query(collection(db, RETAINED_FUND_LEDGER_COLLECTION), where('eventId', '==', targetEventId));
            const retSnap = await getDocs(retQ);
            retSnap.forEach((d) => {
              const r = d.data() as any;
              const type = String(r.type || '');
              const isIn = type === 'collection_income' || type === 'liquidation_surplus_retained';
              const category: PARActivityLedgerTransaction['category'] =
                type === 'event_expense_deduction'
                  ? 'disbursement'
                  : type === 'liquidation_surplus_retained'
                    ? 'surplus_return'
                    : type === 'liquidation_deficit_deduction'
                      ? 'deficit_coverage'
                      : 'other';
              addTx({
                id: d.id,
                source: 'retained_fund_ledger',
                dateLabel: formatShortTxDate(r.createdAt),
                timestampMs: toTimestampMs(r.createdAt),
                category,
                bucketName: r.organizationName || 'Retained Fund Bucket',
                description: r.description || type,
                amount: Number(r.amount) || 0,
                direction: isIn ? 'in' : 'out',
                performedBy: r.performedBy || '',
              });
            });
          } catch {}

          for (const [colName, sourceKey] of [
            ['sao_ledger', 'sao_ledger'],
            ['organization_ledger', 'organization_ledger'],
          ] as const) {
            try {
              const qLedger = query(collection(db, colName), where('eventId', '==', targetEventId));
              const snap = await getDocs(qLedger);
              snap.forEach((d) => {
                const l = d.data() as any;
                const lType = String(l.type || '').toLowerCase();
                const src = String(l.source || '');
                const category: PARActivityLedgerTransaction['category'] =
                  src === 'liquidation_surplus'
                    ? 'surplus_return'
                    : src === 'liquidation_deficit'
                      ? 'deficit_coverage'
                      : src.includes('disbursement')
                        ? 'disbursement'
                        : 'other';
                addTx({
                  id: d.id,
                  source: sourceKey,
                  dateLabel: formatShortTxDate(l.date || l.createdAt),
                  timestampMs: toTimestampMs(l.date || l.createdAt),
                  category,
                  bucketName: l.fundCategory === 'misc_fee_pool' ? 'SAO Misc Fee Pool' : (l.fundCategory === 'retained_student_activity_fund' ? 'Retained Fund' : 'Organization Ledger'),
                  description: l.description || 'Ledger Transaction',
                  amount: Number(l.amount) || 0,
                  direction: lType === 'income' ? 'in' : 'out',
                  performedBy: l.addedBy || '',
                });
              });
            } catch {}
          }
        }

        // Also check liquidationId queries in case misc/retained entries lack eventId
        if (targetLiqId) {
          try {
            const miscLiqQ = query(collection(db, MISC_FEE_LEDGER_COLLECTION), where('liquidationId', '==', targetLiqId));
            const snap = await getDocs(miscLiqQ);
            snap.forEach((d) => {
              const m = d.data() as any;
              const type = String(m.type || '');
              const isIn = type === 'liquidation_surplus_return' || type === 'disbursement_reversal';
              addTx({
                id: d.id,
                source: 'misc_fee_ledger',
                dateLabel: formatShortTxDate(m.createdAt),
                timestampMs: toTimestampMs(m.createdAt),
                category: type === 'liquidation_surplus_return' ? 'surplus_return' : 'deficit_coverage',
                bucketName: m.bucketName || 'Miscellaneous Fee',
                description:
                  type === 'liquidation_surplus_return'
                    ? `Unspent Surplus Returned to ${m.bucketName || 'Misc Fee'}`
                    : `Overspend Covered by ${m.bucketName || 'Misc Fee'}${m.isSupplementalSource ? ' (Supplemental)' : ''}`,
                amount: Number(m.amount) || 0,
                direction: isIn ? 'in' : 'out',
                referenceNo: m.chequeNumber || '',
                performedBy: m.performedBy || '',
                isSupplemental: Boolean(m.isSupplementalSource),
              });
            });
          } catch {}
        }

        txRows.sort((a, b) => a.timestampMs - b.timestampMs);
        if (!cancelled) setLedgerTransactions(txRows);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    hydrate();
    return () => {
      cancelled = true;
    };
  }, [isOpen, report?.id, report?.eventId, report?.liquidationId, preloadedEvent, preloadedProposal, preloadedLiquidation]);

  const computed = useMemo(() => {
    const fromProp = extractProposalAnticipatedItems(linkedProposal, linkedEvent);
    const fs = report?.financialSummary;

    const anticipatedExpenses =
      fromProp.anticipatedExpenses > 0
        ? fromProp.anticipatedExpenses
        : Number(fs?.anticipatedExpenses || 0);
    const anticipatedLineItems: PARAnticipatedItem[] =
      fromProp.anticipatedLineItems.length > 0
        ? fromProp.anticipatedLineItems
        : (fs?.anticipatedLineItems || []).map((li) => ({
            description: li.description,
            quantity: Number(li.quantity ?? 1) || 1,
            unitAmount: Number(li.unitAmount || 0),
            totalAmount: Number(li.totalAmount || 0),
          }));

    const disbursedBudget = Number(
      linkedLiquidation?.allocatedBudget ??
        linkedLiquidation?.amountAdvanced ??
        fs?.allocatedBudget ??
        fs?.totalRevenue ??
        0
    );
    const actualSpent = Number(
      linkedLiquidation?.totalActualSpending ??
        fs?.totalDisbursed ??
        0
    );
    const variance = Math.round((disbursedBudget - actualSpent) * 100) / 100;

    const lineItemReceipts: PARNormalizedReceiptProof[] = [];
    if (linkedLiquidation && Array.isArray(linkedLiquidation.lineItems)) {
      linkedLiquidation.lineItems.forEach((li, idx) => {
        lineItemReceipts.push(...normalizeReceiptsFromLineItem(li, idx));
      });
    }

    const voucher: DisbursementVoucherAttachment | null =
      (linkedLiquidation as any)?.disbursementVoucher ||
      (linkedLiquidation as any)?.voucher ||
      null;

    const settlementProofs: ReceiptAttachment[] = Array.isArray(linkedLiquidation?.cashierSettlementProofs)
      ? linkedLiquidation!.cashierSettlementProofs!
      : [];

    const sourceAllocations: ProposalBucketAllocation[] =
      (Array.isArray(linkedLiquidation?.allocations) && linkedLiquidation!.allocations!.length > 0 && linkedLiquidation!.allocations!) ||
      (Array.isArray((linkedProposal as any)?.allocations) && (linkedProposal as any).allocations.length > 0 && (linkedProposal as any).allocations) ||
      (Array.isArray(linkedEvent?.allocations) && linkedEvent.allocations.length > 0 && linkedEvent.allocations) ||
      [];

    const surplusReturnAllocations: SurplusReturnAllocation[] = Array.isArray(linkedLiquidation?.surplusReturnAllocations)
      ? linkedLiquidation!.surplusReturnAllocations!
      : [];
    const deficitDeductionAllocations: DeficitDeductionAllocation[] = Array.isArray(linkedLiquidation?.deficitDeductionAllocations)
      ? linkedLiquidation!.deficitDeductionAllocations!
      : [];

    return {
      anticipatedExpenses,
      anticipatedLineItems,
      disbursedBudget,
      actualSpent,
      variance,
      lineItemReceipts,
      voucher,
      settlementProofs,
      sourceAllocations,
      surplusReturnAllocations,
      deficitDeductionAllocations,
    };
  }, [linkedProposal, linkedEvent, linkedLiquidation, report?.financialSummary]);

  return {
    loading,
    linkedEvent,
    linkedProposal,
    linkedLiquidation,
    ledgerTransactions,
    ...computed,
  };
}
