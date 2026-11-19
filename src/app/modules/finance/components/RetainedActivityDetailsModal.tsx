import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  FileCheck,
  History,
  Search,
  Users,
  X,
} from 'lucide-react';
import type { SasContributionActivitySummary } from '../hooks/useRetainedFundStream';
import { formatCurrency } from '../../../utils/currency';
import { formatAppDateTime } from '../../../utils/date';

interface RetainedActivityDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  activity: SasContributionActivitySummary | null;
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cashier_upload: 'Cashier Upload',
  cash: 'Manual / Over-the-Counter',
  gcash: 'GCash',
  bank_transfer: 'Bank Transfer',
};

export function RetainedActivityDetailsModal({
  isOpen,
  onClose,
  activity,
}: RetainedActivityDetailsModalProps) {
  const [studentSearch, setStudentSearch] = useState('');

  const filteredStudents = useMemo(() => {
    if (!activity) return [];
    const q = studentSearch.trim().toLowerCase();
    if (!q) return activity.paidStudents;
    return activity.paidStudents.filter(
      (s) =>
        s.studentName.toLowerCase().includes(q) ||
        s.studentSchoolId.toLowerCase().includes(q) ||
        s.orNumber.toLowerCase().includes(q) ||
        s.courseCode.toLowerCase().includes(q)
    );
  }, [activity, studentSearch]);

  if (!isOpen || !activity) return null;

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl border border-gray-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-[#001A4D] px-6 py-4 flex items-center justify-between text-white">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold truncate">{activity.eventTitle}</h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/15 text-blue-100 uppercase">
                {activity.fundingSource === 'student_contributions'
                  ? 'Student Collection'
                  : 'Retained SAO Fund'}
              </span>
              {activity.schoolYear && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-400/30">
                  SY {activity.schoolYear}
                </span>
              )}
            </div>
            <p className="text-[11px] text-white/75 mt-0.5">
              Student Payment Tracking, Disbursement Voucher &amp; Liquidation Settlement Breakdown
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/10 text-white/80 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-5 overflow-y-auto space-y-5">
          {/* 4-Step Financial Lifecycle Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 block">
                1. Asking / Approved Budget
              </span>
              <p className="text-base font-black font-mono text-[#001A4D]">
                {formatCurrency(activity.askingBudget)}
              </p>
              <span className="text-[10px] text-slate-500 block">
                {activity.dateLabel || 'Approved Proposal Ceiling'}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-200 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-800 block">
                2. Collected From Students
              </span>
              <p className="text-base font-black font-mono text-blue-950">
                +{formatCurrency(activity.totalCollected)}
              </p>
              <span className="text-[10px] text-blue-700 block">
                {activity.paidCount} paid • {activity.unpaidCount} unpaid ({activity.totalPayablesCount} total)
              </span>
            </div>

            <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-900 block">
                3. Disbursement Voucher
              </span>
              <p className="text-base font-black font-mono text-amber-950">
                {activity.hasDisbursementVoucher ? `-${formatCurrency(activity.disbursedAmount)}` : '₱0.00'}
              </p>
              {activity.hasDisbursementVoucher ? (
                <div className="flex items-center justify-between gap-1 text-[10px] text-amber-800">
                  <span className="truncate font-mono">
                    {activity.chequeNumber ? `Chk: ${activity.chequeNumber}` : 'Attached'}
                  </span>
                  {activity.voucherFileUrl && (
                    <a
                      href={activity.voucherFileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-0.5 font-bold text-[#0E4EBD] hover:underline shrink-0"
                    >
                      Voucher <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  )}
                </div>
              ) : (
                <span className="text-[10px] text-amber-700 block">Pending Voucher Upload</span>
              )}
            </div>

            <div
              className={`p-3 rounded-xl border space-y-1 ${
                activity.liquidationStage === 'surplus_returned'
                  ? 'bg-emerald-50 border-emerald-200'
                  : activity.liquidationStage === 'reimbursed'
                    ? 'bg-rose-50 border-rose-200'
                    : 'bg-purple-50/60 border-purple-200'
              }`}
            >
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700 block">
                4. Liquidation Settlement
              </span>
              <p
                className={`text-base font-black font-mono ${
                  activity.liquidationStage === 'surplus_returned'
                    ? 'text-emerald-800'
                    : activity.liquidationStage === 'reimbursed'
                      ? 'text-rose-800'
                      : 'text-slate-700'
                }`}
              >
                {activity.liquidationStage === 'surplus_returned'
                  ? `+${formatCurrency(activity.surplusReturned)}`
                  : activity.liquidationStage === 'reimbursed'
                    ? `-${formatCurrency(activity.reimbursedAmount)}`
                    : activity.liquidationStage === 'balanced'
                      ? '₱0.00 (Exact)'
                      : activity.liquidationStage === 'awaiting_proof' ||
                          activity.liquidationStage === 'awaiting_verification'
                        ? `${activity.variance >= 0 ? '+' : '-'}${formatCurrency(Math.abs(activity.variance))} (Pending)`
                        : 'Not Settled'}
              </p>
              <div className="flex items-center justify-between gap-1 text-[10px]">
                <span className="text-slate-600 truncate">
                  {activity.liquidationStage === 'surplus_returned'
                    ? 'Surplus Proof Verified'
                    : activity.liquidationStage === 'reimbursed'
                      ? 'Reimbursement Proof Verified'
                      : activity.liquidationStage === 'awaiting_proof'
                        ? 'Awaiting Settlement Proof'
                        : activity.liquidationStage === 'awaiting_verification'
                          ? 'Proof Attached • Awaiting Verify'
                          : activity.liquidationStage === 'pending_approval'
                            ? 'Liquidation Under Review'
                            : activity.liquidationStage === 'balanced'
                              ? 'Zero Variance'
                              : 'Not Filed Yet'}
                </span>
                {activity.cashierSettlementProofs.length > 0 && (
                  <a
                    href={activity.cashierSettlementProofs[0].fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-0.5 font-bold text-[#0E4EBD] hover:underline shrink-0"
                  >
                    Proof ({activity.cashierSettlementProofs.length}) <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Paid Students Table */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="p-3.5 bg-slate-50 border-b border-gray-200 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-[#0E4EBD]" />
                <h4 className="text-xs font-bold text-[#001A4D] uppercase tracking-wider">
                  Paid Students Tracker ({activity.paidStudents.length})
                </h4>
              </div>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  placeholder="Search ID, name, OR #..."
                  className="pl-8 pr-3 py-1.5 border border-gray-300 rounded-lg text-xs bg-white outline-none focus:ring-2 focus:ring-blue-500/20 w-52"
                />
              </div>
            </div>

            {filteredStudents.length === 0 ? (
              <div className="p-6 text-center text-xs text-gray-500">
                {activity.paidStudents.length === 0
                  ? 'No student payments recorded for this activity yet. Payments from Cashier Upload or Manual Recording will appear here.'
                  : 'No paid student records match your search.'}
              </div>
            ) : (
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-100 sticky top-0 text-gray-600 font-bold border-b border-gray-200">
                    <tr>
                      <th className="py-2 px-3">Student ID</th>
                      <th className="py-2 px-3">Student Name</th>
                      <th className="py-2 px-3">Program / Yr</th>
                      <th className="py-2 px-3">OR #</th>
                      <th className="py-2 px-3">Source</th>
                      <th className="py-2 px-3">Date Paid</th>
                      <th className="py-2 px-3 text-right">Amount Paid</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredStudents.map((stu) => (
                      <tr key={stu.id} className="hover:bg-slate-50/70">
                        <td className="p-2.5 font-mono text-gray-700 whitespace-nowrap">
                          {stu.studentSchoolId}
                        </td>
                        <td className="p-2.5 font-semibold text-[#001A4D]">{stu.studentName}</td>
                        <td className="p-2.5 text-gray-600">
                          {stu.courseCode}
                          {stu.yearLevel ? ` • ${stu.yearLevel}` : ''}
                        </td>
                        <td className="p-2.5 font-mono text-gray-600">{stu.orNumber}</td>
                        <td className="p-2.5">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-800 border border-blue-200">
                            {PAYMENT_METHOD_LABELS[stu.paymentMethod] || stu.paymentMethod}
                          </span>
                        </td>
                        <td className="p-2.5 text-gray-500 whitespace-nowrap">
                          {stu.paidAtMillis ? formatAppDateTime(new Date(stu.paidAtMillis)) : '—'}
                        </td>
                        <td className="p-2.5 text-right font-mono font-bold text-emerald-700">
                          +{formatCurrency(stu.paidAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Retained Fund Ledger Entries Scoped to This Activity */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="p-3.5 bg-slate-50 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-[#0E4EBD]" />
                <h4 className="text-xs font-bold text-[#001A4D] uppercase tracking-wider">
                  Retained Fund Ledger Entries ({activity.ledgerEntries.length})
                </h4>
              </div>
              <span className="text-[11px] font-mono font-bold text-[#001A4D]">
                Net Retained Effect: {activity.netRetainedImpact >= 0 ? '+' : '-'}
                {formatCurrency(Math.abs(activity.netRetainedImpact))}
              </span>
            </div>
            {activity.ledgerEntries.length === 0 ? (
              <div className="p-5 text-center text-xs text-gray-500">
                No Retained Fund ledger entries posted for this activity yet.
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-50 border-b border-gray-200 text-gray-600 font-bold">
                  <tr>
                    <th className="py-2 px-3">Date</th>
                    <th className="py-2 px-3">Description</th>
                    <th className="py-2 px-3">Type</th>
                    <th className="py-2 px-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {activity.ledgerEntries.map((entry) => {
                    const isCredit =
                      entry.type === 'collection_income' ||
                      entry.type === 'liquidation_surplus_retained';
                    return (
                      <tr key={entry.id} className="hover:bg-slate-50/70">
                        <td className="p-2.5 text-gray-500 whitespace-nowrap">
                          {entry.createdAt ? formatAppDateTime(entry.createdAt) : '—'}
                        </td>
                        <td className="p-2.5 text-gray-800">{entry.description}</td>
                        <td className="p-2.5">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              isCredit
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {isCredit ? (
                              <CheckCircle2 className="w-3 h-3" />
                            ) : (
                              <Clock className="w-3 h-3" />
                            )}
                            {entry.type.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td
                          className={`p-2.5 text-right font-mono font-bold ${
                            isCredit ? 'text-emerald-700' : 'text-rose-700'
                          }`}
                        >
                          {isCredit ? '+' : '-'}
                          {formatCurrency(entry.amount)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
