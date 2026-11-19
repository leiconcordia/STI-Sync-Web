import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  CheckCircle2,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type {
  DeficitDeductionAllocation,
  FundAllocationFundType,
  ProposalBucketAllocation,
} from '../../activity-proposals/types/proposal.types';
import type { ComputedBucketBalance } from '../types/misc-fee.types';
import type { RetainedActivityFundDocument } from '../types/retained-fund.types';
import {
  computeWaterfallDeficitAllocations,
  rebalanceDeficitDeductionAllocations,
  validateDeficitDeductionAllocations,
} from '../../activity-proposals/utils/proposal-calculations';
import { shouldAllowSupplementalDeficitBuckets } from '../utils/liquidation-settlement.utils';

export interface SupplementalBucketOption {
  bucketId: string;
  bucketName: string;
  fundType: FundAllocationFundType;
  availableBalance: number;
}

export function resolveLiveBucketAvailableBalance(params: {
  bucketId: string;
  bucketName?: string;
  fundType: FundAllocationFundType;
  computedBuckets: ComputedBucketBalance[];
  saoRetainedFund?: RetainedActivityFundDocument | null;
  orgRetainedFunds?: RetainedActivityFundDocument[];
  orgLedgerBalance?: number;
}): number {
  const { bucketId, bucketName, fundType, computedBuckets, saoRetainedFund, orgRetainedFunds = [], orgLedgerBalance } = params;
  if (fundType === 'misc_fee') {
    const match = computedBuckets.find(
      (cb) =>
        cb.bucket.id === bucketId ||
        (bucketName && cb.bucket.particular.toLowerCase() === bucketName.toLowerCase())
    );
    return match ? Math.max(0, Number(match.currentAvailable) || 0) : 0;
  }

  if (bucketId === 'SAO_CAMPUS' || fundType === 'student_contribution_retained') {
    if (bucketId.startsWith('ORG_')) {
      const cleanOrgId = bucketId.replace(/^ORG_/, '');
      const orgMatch = orgRetainedFunds.find(
        (f) =>
          f.id === bucketId ||
          f.id.startsWith(`${bucketId}__SY_`) ||
          f.organizationId === cleanOrgId
      );
      const retBal = Number(orgMatch?.availableBalance) || 0;
      const ledgerBal = Math.max(0, Number(orgLedgerBalance) || 0);
      return ledgerBal > 0 ? ledgerBal : retBal;
    }
    return Math.max(0, Number(saoRetainedFund?.availableBalance) || 0);
  }

  const cleanOrgId = bucketId.startsWith('ORG_') ? bucketId.replace(/^ORG_/, '') : bucketId;
  const orgMatch = orgRetainedFunds.find(
    (f) =>
      f.id === bucketId ||
      f.id.startsWith(`${bucketId}__SY_`) ||
      f.organizationId === cleanOrgId ||
      (bucketName && f.organizationName?.toLowerCase() === bucketName.toLowerCase())
  );
  const retBal = Number(orgMatch?.availableBalance) || 0;
  return retBal > 0 ? retBal : Math.max(0, Number(orgLedgerBalance) || 0);
}

export function buildDeficitSeedAndSupplementalOptions(params: {
  totalDeficit: number;
  fundingSource?: string | null;
  sourceAllocations: ProposalBucketAllocation[];
  savedDeficitRows?: DeficitDeductionAllocation[];
  computedBuckets: ComputedBucketBalance[];
  saoEligibleBuckets: ComputedBucketBalance[];
  saoRetainedFund?: RetainedActivityFundDocument | null;
  orgRetainedFunds?: RetainedActivityFundDocument[];
  targetOrgId?: string | null;
  targetOrgName?: string | null;
  orgLedgerBalance?: number;
  studentCollectionAvailableOverride?: number;
  allowSupplementalBuckets?: boolean;
}): {
  initialRows: DeficitDeductionAllocation[];
  supplementalOptions: SupplementalBucketOption[];
} {
  const {
    totalDeficit,
    fundingSource,
    sourceAllocations,
    savedDeficitRows = [],
    computedBuckets,
    saoEligibleBuckets,
    saoRetainedFund,
    orgRetainedFunds = [],
    targetOrgId,
    targetOrgName,
    orgLedgerBalance,
    studentCollectionAvailableOverride,
    allowSupplementalBuckets,
  } = params;

  const getLiveAvail = (bucketId: string, bucketName: string, fundType: FundAllocationFundType) =>
    resolveLiveBucketAvailableBalance({
      bucketId,
      bucketName,
      fundType,
      computedBuckets,
      saoRetainedFund,
      orgRetainedFunds,
      orgLedgerBalance,
    });

  const srcLower = String(fundingSource || '').trim().toLowerCase();
  const hasMiscSource = sourceAllocations.some((a) => a.fundType === 'misc_fee');
  const isStudentCollectionMode =
    !hasMiscSource &&
    (srcLower === 'student_contributions' ||
      srcLower === 'retained_sao_fund' ||
      (srcLower === '' &&
        sourceAllocations.length > 0 &&
        sourceAllocations.every(
          (a) =>
            a.fundType === 'student_contributions' ||
            a.fundType === 'student_contribution_retained'
        )));

  const cleanOrgId = String(targetOrgId || '').trim();
  const isSasSentinel =
    !cleanOrgId ||
    ['sas', 'sas_admin', 'sao', 'sao_admin', 'admin', 'institutional'].includes(
      cleanOrgId.toLowerCase()
    );

  if (isStudentCollectionMode) {
    const isSas = srcLower === 'retained_sao_fund' || isSasSentinel;
    const canonicalBucketId = isSas ? 'SAO_CAMPUS' : `ORG_${cleanOrgId}`;
    const canonicalBucketName = isSas
      ? 'SAS Student Contribution & Retained Funds'
      : `${targetOrgName || 'Organization'} Student Collections Fund`;
    const liveAvail =
      studentCollectionAvailableOverride !== undefined
        ? Math.max(0, Number(studentCollectionAvailableOverride) || 0)
        : getLiveAvail(canonicalBucketId, canonicalBucketName, 'student_contribution_retained');

    const totalOriginalAllocated = sourceAllocations.reduce(
      (sum, a) => sum + (Number(a.allocatedAmount) || 0),
      0
    );

    const compatibleSaved = savedDeficitRows.filter(
      (r) => !r.isSupplementalSource && r.fundType !== 'misc_fee'
    );
    const seedRows: DeficitDeductionAllocation[] =
      compatibleSaved.length > 0
        ? [
            {
              bucketId: canonicalBucketId,
              bucketName: canonicalBucketName,
              fundType: 'student_contribution_retained',
              originalAllocatedAmount:
                Number(compatibleSaved[0].originalAllocatedAmount) || totalOriginalAllocated,
              availableBalance: liveAvail,
              deductAmount: Math.min(
                liveAvail,
                Math.max(0, Number(compatibleSaved[0].deductAmount) || totalDeficit)
              ),
              isSupplementalSource: false,
            },
          ]
        : computeWaterfallDeficitAllocations({
            totalDeficit,
            rows: [
              {
                bucketId: canonicalBucketId,
                bucketName: canonicalBucketName,
                fundType: 'student_contribution_retained',
                originalAllocatedAmount: totalOriginalAllocated,
                availableBalance: liveAvail,
                deductAmount: 0,
                isSupplementalSource: false,
              },
            ],
          });

    return {
      initialRows: seedRows,
      supplementalOptions: [],
    };
  }

  let initialRows: DeficitDeductionAllocation[] = [];
  if (savedDeficitRows.length > 0) {
    initialRows = savedDeficitRows.map((r) => ({
      ...r,
      availableBalance: getLiveAvail(r.bucketId, r.bucketName, r.fundType),
    }));
  } else if (sourceAllocations.length > 0) {
    const baseRows: DeficitDeductionAllocation[] = sourceAllocations.map((a) => ({
      bucketId: a.bucketId,
      bucketName: a.bucketName,
      fundType: a.fundType,
      originalAllocatedAmount: Number(a.allocatedAmount) || 0,
      availableBalance: getLiveAvail(a.bucketId, a.bucketName, a.fundType),
      deductAmount: 0,
      isSupplementalSource: false,
    }));
    initialRows = computeWaterfallDeficitAllocations({
      totalDeficit,
      rows: baseRows,
    });
  }

  const canAddSupplementalBuckets = shouldAllowSupplementalDeficitBuckets({
    fundingSource,
    sourceAllocations,
    allowSupplementalBuckets,
  });

  const supplementalOptions: SupplementalBucketOption[] = [];
  if (canAddSupplementalBuckets) {
    for (const cb of saoEligibleBuckets) {
      supplementalOptions.push({
        bucketId: cb.bucket.id,
        bucketName: cb.bucket.particular,
        fundType: 'misc_fee',
        availableBalance: Math.max(0, Number(cb.currentAvailable) || 0),
      });
    }
    if (saoRetainedFund && (Number(saoRetainedFund.availableBalance) || 0) > 0) {
      supplementalOptions.push({
        bucketId: saoRetainedFund.id,
        bucketName: saoRetainedFund.organizationName || 'Campus Student Contribution Retained Bucket',
        fundType: 'student_contribution_retained',
        availableBalance: Math.max(0, Number(saoRetainedFund.availableBalance) || 0),
      });
    }
    if (cleanOrgId && !isSasSentinel) {
      const orgAvail = getLiveAvail(`ORG_${cleanOrgId}`, targetOrgName || 'Organization Treasury', 'org_treasury');
      if (orgAvail > 0) {
        supplementalOptions.push({
          bucketId: `ORG_${cleanOrgId}`,
          bucketName: `${targetOrgName || 'Organization'} Treasury`,
          fundType: 'org_treasury',
          availableBalance: orgAvail,
        });
      }
    }
  }

  return { initialRows, supplementalOptions };
}

interface DeficitCoverageAllocationPanelProps {
  totalDeficit: number;
  rows: DeficitDeductionAllocation[];
  onChange: (rows: DeficitDeductionAllocation[]) => void;
  supplementalOptions: SupplementalBucketOption[];
  isStudentCollection?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  title?: string;
}

const formatPHP = (n: number) =>
  `₱${Number(n || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export function DeficitCoverageAllocationPanel({
  totalDeficit,
  rows,
  onChange,
  supplementalOptions,
  isStudentCollection = false,
  disabled = false,
  readOnly = false,
  title,
}: DeficitCoverageAllocationPanelProps) {
  const [selectedSuppId, setSelectedSuppId] = useState('');
  const isOrgTreasuryOnly =
    !isStudentCollection &&
    supplementalOptions.length === 0 &&
    rows.length > 0 &&
    rows.every((r) => r.fundType === 'org_treasury');
  const resolvedTitle =
    title ||
    (isStudentCollection
      ? 'Student Collections Reimbursement Coverage Check'
      : isOrgTreasuryOnly
        ? 'Org Treasury Overspend Coverage'
        : 'Overspend Coverage Routing (Bucket Waterfall & Supplemental Selection)');

  const validation = useMemo(
    () =>
      validateDeficitDeductionAllocations({
        totalDeficit,
        rows,
        mode: isStudentCollection ? 'student_collections' : 'misc_or_mixed',
      }),
    [totalDeficit, rows, isStudentCollection]
  );

  const studentShortfall = useMemo(
    () => Math.max(0, Math.round((totalDeficit - validation.totalCapacityAvailable) * 100) / 100),
    [totalDeficit, validation.totalCapacityAvailable]
  );

  const unusedSupplementalOptions = useMemo(() => {
    const usedIds = new Set(rows.map((r) => r.bucketId));
    return supplementalOptions.filter(
      (opt) => !usedIds.has(opt.bucketId) && opt.availableBalance > 0.009
    );
  }, [supplementalOptions, rows]);

  const handleAutoWaterfall = () => {
    if (disabled || readOnly || rows.length === 0) return;
    onChange(
      computeWaterfallDeficitAllocations({
        totalDeficit,
        rows,
      })
    );
  };

  const handleAddSupplementalBucket = (bucketIdToAdd: string) => {
    const targetId = bucketIdToAdd || selectedSuppId;
    if (!targetId) return;
    const match = unusedSupplementalOptions.find((o) => o.bucketId === targetId);
    if (!match) return;

    const currentAssigned = rows.reduce((s, r) => s + (Number(r.deductAmount) || 0), 0);
    const remainingNeeded = Math.max(0, Math.round((totalDeficit - currentAssigned) * 100) / 100);
    const autoTake = Math.min(remainingNeeded, Math.round(match.availableBalance * 100) / 100);

    onChange([
      ...rows,
      {
        bucketId: match.bucketId,
        bucketName: match.bucketName,
        fundType: match.fundType,
        originalAllocatedAmount: 0,
        availableBalance: match.availableBalance,
        deductAmount: autoTake,
        isSupplementalSource: true,
      },
    ]);
    setSelectedSuppId('');
  };

  return (
    <div className="p-4 rounded-2xl bg-rose-50/60 border border-rose-200 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="font-bold text-rose-950 text-xs uppercase tracking-wider flex items-center gap-1.5">
            <ArrowDownRight className="w-3.5 h-3.5 text-rose-700" />
            {resolvedTitle}
          </h4>
          <p className="text-xs text-rose-900/80 mt-0.5">
            {isStudentCollection ? (
              <>
                Reimbursement for the <strong className="font-mono">{formatPHP(totalDeficit)}</strong>{' '}
                overspend must be funded strictly by collected Student Collections (Miscellaneous Fee
                buckets cannot be used).
              </>
            ) : (
              <>
                Assign 100% of the <strong className="font-mono">{formatPHP(totalDeficit)}</strong>{' '}
                overspend to bucket(s) with sufficient available balance. No unrecorded absorption is
                allowed.
              </>
            )}
          </p>
        </div>

        {!readOnly && !isStudentCollection && (rows.length > 1 || unusedSupplementalOptions.length > 0) && (
          <button
            type="button"
            disabled={disabled}
            onClick={handleAutoWaterfall}
            className="px-3 py-1.5 rounded-lg bg-white border border-rose-300 text-[11px] font-bold text-rose-900 hover:bg-rose-50 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Sparkles className="w-3 h-3 text-rose-600" />
            Auto-Waterfall Cover
          </button>
        )}
      </div>

      {isStudentCollection && (
        <div className="space-y-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
            <div className="p-2.5 rounded-xl bg-white border border-rose-200">
              <span className="text-[10px] font-bold uppercase text-gray-500 block">
                Overspend to Reimburse
              </span>
              <strong className="font-mono text-rose-800 text-sm">{formatPHP(totalDeficit)}</strong>
            </div>
            <div className="p-2.5 rounded-xl bg-white border border-rose-200">
              <span className="text-[10px] font-bold uppercase text-gray-500 block">
                Available Collected Funds
              </span>
              <strong
                className={`font-mono text-sm ${
                  studentShortfall > 0.009 ? 'text-rose-700' : 'text-emerald-700'
                }`}
              >
                {formatPHP(validation.totalCapacityAvailable)}
              </strong>
            </div>
            <div className="p-2.5 rounded-xl bg-white border border-rose-200">
              <span className="text-[10px] font-bold uppercase text-gray-500 block">
                Remaining Shortfall to Collect
              </span>
              <strong
                className={`font-mono text-sm ${
                  studentShortfall > 0.009 ? 'text-rose-700' : 'text-emerald-700'
                }`}
              >
                {formatPHP(studentShortfall)}
              </strong>
            </div>
          </div>

          {studentShortfall > 0.009 && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-950 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-amber-900">Collect Student Contributions First</p>
                <p className="mt-0.5">
                  Student Collections funds are currently short by{' '}
                  <strong className="font-mono">{formatPHP(studentShortfall)}</strong>. Reimbursement
                  cannot push through until remaining student contributions are collected and posted.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Selected / AP Buckets List */}
      <div className="space-y-2">
        {rows.map((row, idx) => {
          const rowErr = validation.perBucketErrors[row.bucketId];
          const fundLabel = isStudentCollection
            ? 'Student Collections'
            : row.fundType === 'misc_fee'
              ? 'Misc Fee'
              : row.fundType === 'org_treasury'
                ? 'Org Treasury'
                : 'Retained Fund';
          return (
            <div
              key={row.bucketId}
              className={`p-3 rounded-xl border bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                rowErr ? 'border-rose-400 ring-1 ring-rose-300' : 'border-rose-200/80'
              }`}
            >
              <div className="min-w-0 space-y-0.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  {!isStudentCollection && (
                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                      #{idx + 1}
                    </span>
                  )}
                  <span className="text-xs font-bold text-[#001A4D] truncate">
                    {row.bucketName}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-700">
                    {fundLabel}
                  </span>
                  {!isStudentCollection &&
                    (row.isSupplementalSource ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-indigo-100 text-indigo-800">
                        Supplemental Bucket
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-100 text-blue-800">
                        Approved AP Source
                      </span>
                    ))}
                </div>
                <p className="text-[11px] text-gray-600 font-mono flex flex-wrap items-center gap-3">
                  {row.originalAllocatedAmount > 0 && (
                    <span>
                      Originally Pulled: <strong>{formatPHP(row.originalAllocatedAmount)}</strong>
                    </span>
                  )}
                  <span
                    className={
                      row.availableBalance <= 0.009 ? 'text-rose-700 font-semibold' : 'text-emerald-700 font-semibold'
                    }
                  >
                    Live Available Balance: <strong>{formatPHP(row.availableBalance)}</strong>
                  </span>
                </p>
                {rowErr && <p className="text-[11px] font-semibold text-rose-600">{rowErr}</p>}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <label className="text-[11px] font-bold text-gray-700 whitespace-nowrap">
                  Deduct (₱):
                </label>
                {readOnly || (rows.length === 1 && row.availableBalance + 0.009 >= totalDeficit) ? (
                  <span className="font-mono font-bold text-xs text-rose-900 px-2.5 py-1.5 bg-rose-50 rounded-lg border border-rose-200">
                    -{formatPHP(row.deductAmount)}
                  </span>
                ) : (
                  <>
                    <input
                      type="number"
                      min="0"
                      max={Math.max(0, row.availableBalance)}
                      step="0.01"
                      disabled={disabled || row.availableBalance <= 0.009}
                      value={row.deductAmount}
                      onChange={(e) => {
                        const rawVal =
                          e.target.value === ''
                            ? 0
                            : Math.max(0, parseFloat(e.target.value) || 0);
                        onChange(
                          rebalanceDeficitDeductionAllocations({
                            totalDeficit,
                            rows,
                            editedBucketId: row.bucketId,
                            editedAmount: rawVal,
                          })
                        );
                      }}
                      className={`w-36 px-2.5 py-1.5 border rounded-lg text-xs text-right font-mono font-bold outline-none ${
                        rowErr
                          ? 'border-rose-400 bg-rose-50 text-rose-900'
                          : 'border-rose-300 bg-white text-[#001A4D]'
                      } disabled:bg-gray-100 disabled:text-gray-400`}
                    />
                    {!isStudentCollection && row.isSupplementalSource && (
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          const filtered = rows.filter((r) => r.bucketId !== row.bucketId);
                          onChange(
                            computeWaterfallDeficitAllocations({
                              totalDeficit,
                              rows: filtered,
                            })
                          );
                        }}
                        title="Remove supplemental bucket"
                        className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-100 cursor-pointer disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Supplemental Bucket when AP buckets fall short or user wants to add another bucket */}
      {!readOnly && !isStudentCollection && unusedSupplementalOptions.length > 0 && (
        <div
          className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center gap-2 ${
            validation.needsAdditionalBucket || rows.length === 0
              ? 'bg-amber-50 border-amber-300'
              : 'bg-white/80 border-rose-200'
          }`}
        >
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-bold text-[#001A4D]">
              {validation.needsAdditionalBucket
                ? `Additional Bucket Needed (Short by ${formatPHP(Math.max(0, totalDeficit - validation.totalCapacityAvailable))})`
                : 'Select Additional Bucket (Optional)'}
            </p>
            <select
              value={selectedSuppId}
              disabled={disabled}
              onChange={(e) => setSelectedSuppId(e.target.value)}
              className="mt-1 w-full px-2.5 py-1.5 rounded-lg border border-gray-300 bg-white text-xs text-gray-800 outline-none focus:border-[#0E4EBD]"
            >
              <option value="">-- Choose another bucket with available balance --</option>
              {unusedSupplementalOptions.map((opt) => (
                <option key={opt.bucketId} value={opt.bucketId}>
                  {opt.bucketName} ({opt.fundType === 'misc_fee' ? 'Misc Fee' : opt.fundType === 'org_treasury' ? 'Org Treasury' : 'Retained Fund'} • Avail: {formatPHP(opt.availableBalance)})
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            disabled={disabled || !selectedSuppId}
            onClick={() => handleAddSupplementalBucket(selectedSuppId)}
            className="px-3 py-2 rounded-lg bg-[#001A4D] hover:bg-[#0E4EBD] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 shrink-0 sm:mt-4"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Bucket
          </button>
        </div>
      )}

      {/* Totals & Exact Coverage Status */}
      <div
        className={`p-3 rounded-xl border flex flex-wrap items-center justify-between gap-2 text-xs ${
          validation.isValid
            ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
            : 'bg-amber-50 border-amber-300 text-amber-950'
        }`}
      >
        <div className="flex flex-wrap items-center gap-4 font-mono">
          <span>
            Total Overspend: <strong>{formatPHP(totalDeficit)}</strong>
          </span>
          <span>
            Total Assigned: <strong>{formatPHP(validation.totalDeducted)}</strong>
          </span>
          <span>
            Unassigned:{' '}
            <strong>{formatPHP(validation.remainingDeficitToAssign)}</strong>
          </span>
        </div>
        <span
          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase inline-flex items-center gap-1 ${
            validation.isValid ? 'bg-emerald-600 text-white' : 'bg-amber-600 text-white'
          }`}
        >
          {validation.isValid ? (
            <>
              <CheckCircle2 className="w-3 h-3" />
              100% Covered
            </>
          ) : (
            <>
              <AlertTriangle className="w-3 h-3" />
              Coverage Required
            </>
          )}
        </span>
      </div>

      {validation.summaryError && (
        <p className="text-xs font-semibold text-rose-700">{validation.summaryError}</p>
      )}
    </div>
  );
}
