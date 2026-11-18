import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import type {
  RetainedActivityFundDocument,
  RetainedFundLedgerEntry,
} from '../types/retained-fund.types';
import {
  RETAINED_FUNDS_COLLECTION,
  RETAINED_FUND_LEDGER_COLLECTION,
  SAO_RETAINED_BUCKET_ID,
  buildScopedRetainedBucketId,
  normalizeRetainedSchoolYear,
} from '../services/retained-fund.service';
import { parseTimestampMillis } from './useFinanceStream';
import { useAllEvents } from '../../events/hooks/useEventStream';
import { useAllPayables } from './usePayableStream';
import { useAllLiquidations } from './useLiquidationStream';
import { isSasCreatedEvent } from '../../events/utils/organization-display.utils';
import type { ReceiptAttachment } from '../types/liquidation.types';

export interface PaidStudentRecord {
  id: string;
  studentId: string;
  studentSchoolId: string;
  studentName: string;
  courseCode: string;
  yearLevel: string;
  assignedAmount: number;
  paidAmount: number;
  retainedCreditedAmount: number;
  orNumber: string;
  paymentMethod: string;
  transferredBatchId?: string;
  paidAtMillis: number;
}

export type SasActivityLiquidationStage =
  | 'not_filed'
  | 'pending_approval'
  | 'awaiting_proof'
  | 'awaiting_verification'
  | 'surplus_returned'
  | 'reimbursed'
  | 'balanced';

export interface SasContributionActivitySummary {
  eventId: string;
  eventTitle: string;
  schoolYear: string;
  semester: string;
  fundingSource: 'student_contributions' | 'retained_sao_fund';
  eventStatus: string;
  dateLabel: string;
  askingBudget: number;
  totalPayablesCount: number;
  paidCount: number;
  unpaidCount: number;
  totalCollected: number;
  uncreditedCollected: number;
  hasDisbursementVoucher: boolean;
  disbursedAmount: number;
  disbursedUnposted: boolean;
  chequeNumber?: string;
  disbursementDate?: string;
  voucherFileUrl?: string;
  actualSpent: number;
  variance: number;
  liquidationId?: string;
  liquidationStage: SasActivityLiquidationStage;
  surplusReturned: number;
  reimbursedAmount: number;
  cashierReferenceNo?: string;
  cashierSettlementProofs: ReceiptAttachment[];
  paidStudents: PaidStudentRecord[];
  ledgerEntries: RetainedFundLedgerEntry[];
  netRetainedImpact: number;
  needsSync: boolean;
}

export function useRetainedActivityFunds(
  organizationId?: string | null,
  schoolYear?: string | null
) {
  const [fundDocs, setFundDocs] = useState<RetainedActivityFundDocument[]>([]);
  const [rawLedgerEntries, setRawLedgerEntries] = useState<RetainedFundLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubFunds = onSnapshot(
      collection(db, RETAINED_FUNDS_COLLECTION),
      (snap) => {
        const docs = snap.docs.map(
          (d) => ({ id: d.id, ...(d.data() as any) } as RetainedActivityFundDocument)
        );
        setFundDocs(docs);
        setLoading(false);
      },
      (err) => {
        console.warn('[useRetainedActivityFunds] Error listening to funds:', err);
        setLoading(false);
      }
    );

    const unsubLedger = onSnapshot(
      collection(db, RETAINED_FUND_LEDGER_COLLECTION),
      (snap) => {
        const entries = snap.docs.map(
          (d) => ({ id: d.id, ...(d.data() as any) } as RetainedFundLedgerEntry)
        );
        entries.sort((a, b) => parseTimestampMillis(b.createdAt) - parseTimestampMillis(a.createdAt));
        setRawLedgerEntries(entries);
      },
      (err) => {
        console.warn('[useRetainedActivityFunds] Error listening to ledger:', err);
      }
    );

    return () => {
      unsubFunds();
      unsubLedger();
    };
  }, []);

  const cleanSy = normalizeRetainedSchoolYear(schoolYear);

  const saoRetainedFund = useMemo<RetainedActivityFundDocument>(() => {
    if (cleanSy) {
      const scopedId = buildScopedRetainedBucketId(SAO_RETAINED_BUCKET_ID, cleanSy);
      const scopedMatch = fundDocs.find(
        (f) =>
          f.id === scopedId ||
          (f.ownerType === 'sao' && normalizeRetainedSchoolYear(f.schoolYear) === cleanSy)
      );
      if (scopedMatch) return scopedMatch;

      // Fall back to unscoped legacy SAO_CAMPUS only if it has not been migrated to a different SY
      const legacy = fundDocs.find((f) => f.id === SAO_RETAINED_BUCKET_ID);
      if (
        legacy &&
        (!legacy.migratedToSchoolYear ||
          normalizeRetainedSchoolYear(legacy.migratedToSchoolYear) === cleanSy)
      ) {
        return legacy;
      }

      return {
        id: scopedId,
        ownerType: 'sao',
        schoolYear: cleanSy,
        organizationName: 'SAO / Campus Student Activity Fund',
        totalContributionsCollected: 0,
        totalSurplusesRetained: 0,
        totalDisbursedOrSpent: 0,
        availableBalance: 0,
      };
    }

    // No explicit SY filter: prefer the newest SY-scoped SAO doc, then legacy SAO_CAMPUS
    const syScopedDocs = fundDocs
      .filter((f) => f.ownerType === 'sao' && Boolean(f.schoolYear))
      .sort((a, b) => String(b.schoolYear || '').localeCompare(String(a.schoolYear || '')));
    if (syScopedDocs.length > 0) return syScopedDocs[0];

    return (
      fundDocs.find((f) => f.id === SAO_RETAINED_BUCKET_ID) || {
        id: SAO_RETAINED_BUCKET_ID,
        ownerType: 'sao',
        organizationName: 'SAO / Campus Student Activity Fund',
        totalContributionsCollected: 0,
        totalSurplusesRetained: 0,
        totalDisbursedOrSpent: 0,
        availableBalance: 0,
      }
    );
  }, [fundDocs, cleanSy]);

  const orgRetainedFunds = useMemo(() => {
    const orgs = fundDocs.filter((f) => f.ownerType === 'organization');
    if (!cleanSy) return orgs;

    const scopedOrgs = orgs.filter((f) => normalizeRetainedSchoolYear(f.schoolYear) === cleanSy);
    const hasScopedForSy = scopedOrgs.length > 0 || fundDocs.some((f) => f.id === buildScopedRetainedBucketId(SAO_RETAINED_BUCKET_ID, cleanSy));
    if (scopedOrgs.length > 0) return scopedOrgs;

    // Only include un-migrated legacy org docs if this SY doesn't already have its own closed/reset snapshot
    return orgs.filter(
      (f) =>
        !f.schoolYear &&
        !f.migratedToSchoolYear &&
        !hasScopedForSy
    );
  }, [fundDocs, cleanSy]);

  const targetOrgRetainedFund = useMemo(() => {
    if (!organizationId) return null;
    if (cleanSy) {
      const scopedOrgId = buildScopedRetainedBucketId(`ORG_${organizationId}`, cleanSy);
      const scopedMatch = fundDocs.find(
        (f) =>
          f.id === scopedOrgId ||
          (f.organizationId === organizationId &&
            normalizeRetainedSchoolYear(f.schoolYear) === cleanSy)
      );
      if (scopedMatch) return scopedMatch;

      const legacyOrg = fundDocs.find(
        (f) => f.id === `ORG_${organizationId}` || (f.organizationId === organizationId && !f.schoolYear)
      );
      if (
        legacyOrg &&
        (!legacyOrg.migratedToSchoolYear ||
          normalizeRetainedSchoolYear(legacyOrg.migratedToSchoolYear) === cleanSy)
      ) {
        return legacyOrg;
      }
      return null;
    }

    return (
      fundDocs.find(
        (f) => f.id === `ORG_${organizationId}` || f.organizationId === organizationId
      ) || null
    );
  }, [fundDocs, organizationId, cleanSy]);

  const ledgerEntries = useMemo(() => {
    if (!cleanSy) return rawLedgerEntries;
    const legacySao = fundDocs.find((f) => f.id === SAO_RETAINED_BUCKET_ID);
    const allowUntaggedLegacy =
      !legacySao?.migratedToSchoolYear ||
      normalizeRetainedSchoolYear(legacySao.migratedToSchoolYear) === cleanSy;

    return rawLedgerEntries.filter((e) => {
      const entrySy = normalizeRetainedSchoolYear(e.schoolYear);
      if (entrySy) return entrySy === cleanSy;
      return allowUntaggedLegacy;
    });
  }, [rawLedgerEntries, cleanSy, fundDocs]);

  return {
    fundDocs,
    saoRetainedFund,
    orgRetainedFunds,
    targetOrgRetainedFund,
    ledgerEntries,
    allLedgerEntries: rawLedgerEntries,
    loading,
  };
}

/**
 * Live per-activity tracker combining SAS Student Collection (`student_contributions`) and
 * Retained SAO Fund (`retained_sao_fund`) activities with their Cashier-uploaded student payments,
 * Disbursement Voucher deductions, and proof-gated Liquidation Surplus/Reimbursement settlements.
 */
export function useSasContributionActivities(
  schoolYear?: string | null,
  scopedLedgerEntries: RetainedFundLedgerEntry[] = []
): {
  activities: SasContributionActivitySummary[];
  loading: boolean;
} {
  const { events = [], loading: eventsLoading } = useAllEvents();
  const { data: payables = [], loading: payablesLoading } = useAllPayables();
  const { liquidations = [], loading: liqsLoading } = useAllLiquidations();

  const cleanSy = normalizeRetainedSchoolYear(schoolYear);

  const activities = useMemo<SasContributionActivitySummary[]>(() => {
    const ledgerByEvent = new Map<string, RetainedFundLedgerEntry[]>();
    for (const entry of scopedLedgerEntries || []) {
      const evId = String(entry.eventId || '').trim();
      if (!evId) continue;
      const list = ledgerByEvent.get(evId) || [];
      list.push(entry);
      ledgerByEvent.set(evId, list);
    }

    const payablesByEvent = new Map<string, any[]>();
    for (const p of payables || []) {
      const evId = String((p as any).eventId || '').trim();
      if (!evId) continue;
      const st = String((p as any).status || '').toLowerCase();
      if (st === 'cancelled') continue;
      const list = payablesByEvent.get(evId) || [];
      list.push(p);
      payablesByEvent.set(evId, list);
    }

    const liqByEvent = new Map<string, any>();
    for (const l of liquidations || []) {
      if ((l as any).isDeleted || l.status === 'voided') continue;
      const evId = String(l.eventId || '').trim();
      if (!evId) continue;
      const prev = liqByEvent.get(evId);
      if (!prev || l.status === 'approved') {
        liqByEvent.set(evId, l);
      }
    }

    const results: Array<SasContributionActivitySummary & { sortMs: number }> = [];

    for (const ev of events || []) {
      const evAny = ev as any;
      if (evAny.isDeleted || evAny.archived) continue;
      if (ev.proposalStatus === 'draft') continue;
      if (!isSasCreatedEvent(ev)) continue;

      const src = String(evAny.fundingSource || '').trim().toLowerCase();
      if (src !== 'student_contributions' && src !== 'retained_sao_fund') continue;

      const evSy = normalizeRetainedSchoolYear(evAny.schoolYear || evAny.academicYear);
      const evLedger = ledgerByEvent.get(ev.id) || [];
      if (cleanSy) {
        if (evSy) {
          if (evSy !== cleanSy) continue;
        } else if (evLedger.length === 0) {
          // Untagged events are excluded when viewing a specific newer SY unless they have ledger entries here
          continue;
        }
      }

      const evPayables = (payablesByEvent.get(ev.id) || []).filter(
        (p) => Number(p.assignedAmount ?? p.amount ?? 0) > 0 || Number(p.paidAmount ?? 0) > 0
      );

      const paidStudents: PaidStudentRecord[] = [];
      let totalCollected = 0;
      let uncreditedCollected = 0;
      let unpaidCount = 0;

      for (const p of evPayables) {
        const st = String(p.status || '').toLowerCase();
        if (st === 'waived' || st === 'refunded' || st === 'refund_pending') continue;

        const assignedAmt = Math.max(0, Number(p.assignedAmount ?? p.amount ?? 0) || 0);
        const rawPaid = Number(p.paidAmount ?? p.amountPaid ?? 0) || 0;
        const effectivePaid = rawPaid > 0 ? rawPaid : st === 'paid' ? assignedAmt : 0;

        if (effectivePaid > 0 && (st === 'paid' || st === 'partial')) {
          const alreadyCredited = Math.max(0, Number(p.retainedCreditedAmount) || 0);
          totalCollected = Math.round((totalCollected + effectivePaid) * 100) / 100;
          if (effectivePaid - alreadyCredited > 0.009) {
            uncreditedCollected =
              Math.round((uncreditedCollected + (effectivePaid - alreadyCredited)) * 100) / 100;
          }
          paidStudents.push({
            id: p.id,
            studentId: String(p.studentId || ''),
            studentSchoolId: String(p.studentSchoolId || p.studentNumber || p.studentId || '—'),
            studentName: String(p.studentName || 'Student'),
            courseCode: String(p.courseCode || p.program || '—'),
            yearLevel: String(p.yearLevel || ''),
            assignedAmount: assignedAmt,
            paidAmount: effectivePaid,
            retainedCreditedAmount: alreadyCredited,
            orNumber: String(p.orNumber || p.receiptNumber || '—'),
            paymentMethod: String(p.paymentMethod || 'cash'),
            transferredBatchId: p.transferredBatchId || undefined,
            paidAtMillis: parseTimestampMillis(p.paidAt || p.updatedAt),
          });
        } else {
          unpaidCount++;
        }
      }

      paidStudents.sort((a, b) => b.paidAtMillis - a.paidAtMillis);

      const askingBudget = Math.max(
        0,
        Number(evAny.totalApprovedBudget ?? evAny.allocatedBudget ?? 0) || 0
      );
      const voucher = evAny.disbursementVoucher;
      const hasDisbursementVoucher = Boolean(voucher?.fileUrl);
      const disbursedAmount = hasDisbursementVoucher
        ? Math.max(0, Number(voucher?.amountDisbursed) || askingBudget)
        : 0;

      const hasDisbLedger = evLedger.some(
        (e) => e.id === `disb_${ev.id}` || e.id === `event_${ev.id}`
      );
      const disbursedUnposted = hasDisbursementVoucher && disbursedAmount > 0.009 && !hasDisbLedger;

      const liq = liqByEvent.get(ev.id);
      let liquidationStage: SasActivityLiquidationStage = 'not_filed';
      let actualSpent = 0;
      let variance = 0;
      let surplusReturned = 0;
      let reimbursedAmount = 0;
      let cashierReferenceNo = '';
      let cashierSettlementProofs: ReceiptAttachment[] = [];

      if (liq) {
        actualSpent = Math.max(0, Number(liq.totalActualSpending ?? 0) || 0);
        const basis = Number(liq.allocatedBudget ?? liq.amountAdvanced ?? disbursedAmount) || 0;
        variance =
          Math.round(
            Number(liq.surplusOrDeficit ?? basis - actualSpent) * 100
          ) / 100;
        cashierReferenceNo = String(liq.cashierReferenceNo || '');
        cashierSettlementProofs = Array.isArray(liq.cashierSettlementProofs)
          ? liq.cashierSettlementProofs
          : [];

        if (liq.status !== 'approved') {
          liquidationStage = 'pending_approval';
        } else if (Math.abs(variance) < 0.01) {
          liquidationStage = 'balanced';
        } else if (
          liq.cashierSettlementStatus === 'verified' &&
          cashierSettlementProofs.length > 0
        ) {
          if (variance > 0) {
            liquidationStage = 'surplus_returned';
            surplusReturned = variance;
          } else {
            liquidationStage = 'reimbursed';
            reimbursedAmount = Math.abs(variance);
          }
        } else if (
          liq.cashierSettlementStatus === 'proof_uploaded' ||
          cashierSettlementProofs.length > 0
        ) {
          liquidationStage = 'awaiting_verification';
        } else {
          liquidationStage = 'awaiting_proof';
        }
      }

      const ledgerCollected = evLedger
        .filter((e) => e.type === 'collection_income')
        .reduce((s, e) => s + (Number(e.amount) || 0), 0);
      const ledgerDisbursed = evLedger
        .filter((e) => e.type === 'event_expense_deduction' || e.type === 'liquidation_deficit_deduction')
        .reduce((s, e) => s + (Number(e.amount) || 0), 0);
      const ledgerSurplus = evLedger
        .filter((e) => e.type === 'liquidation_surplus_retained')
        .reduce((s, e) => s + (Number(e.amount) || 0), 0);

      const netRetainedImpact =
        Math.round((ledgerCollected + ledgerSurplus - ledgerDisbursed) * 100) / 100;

      const sortMs =
        parseTimestampMillis(evAny.updatedAt) ||
        parseTimestampMillis(evAny.createdAt) ||
        parseTimestampMillis(evAny.startDate) ||
        0;

      results.push({
        eventId: ev.id,
        eventTitle: ev.title || evAny.eventName || 'SAS Activity',
        schoolYear: evSy || cleanSy || '',
        semester: String(evAny.semester || ''),
        fundingSource: src as 'student_contributions' | 'retained_sao_fund',
        eventStatus: String(ev.status || ev.proposalStatus || 'approved'),
        dateLabel: String(evAny.sessions?.[0]?.date || evAny.startDate || ''),
        askingBudget,
        totalPayablesCount: paidStudents.length + unpaidCount,
        paidCount: paidStudents.length,
        unpaidCount,
        totalCollected,
        uncreditedCollected,
        hasDisbursementVoucher,
        disbursedAmount,
        disbursedUnposted,
        chequeNumber: voucher?.chequeNumber,
        disbursementDate: voucher?.disbursementDate,
        voucherFileUrl: voucher?.fileUrl,
        actualSpent,
        variance,
        liquidationId: liq?.id,
        liquidationStage,
        surplusReturned,
        reimbursedAmount,
        cashierReferenceNo,
        cashierSettlementProofs,
        paidStudents,
        ledgerEntries: evLedger,
        netRetainedImpact,
        needsSync: uncreditedCollected > 0.009 || disbursedUnposted,
        sortMs,
      });
    }

    results.sort((a, b) => b.sortMs - a.sortMs);
    return results;
  }, [events, payables, liquidations, scopedLedgerEntries, cleanSy]);

  return {
    activities,
    loading: eventsLoading || payablesLoading || liqsLoading,
  };
}
