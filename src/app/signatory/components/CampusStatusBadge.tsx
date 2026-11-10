import React from 'react';
import { STATUS_LABELS } from '../utils/campus-activity-report';

export default function CampusStatusBadge({ status }: { status: string }) {
  const color = ['approved', 'exempt'].includes(status) ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
    : ['missing', 'returned', 'rejected'].includes(status) ? 'bg-rose-50 text-rose-800 border-rose-200'
    : ['under_review', 'ongoing', 'awaiting_conclusion'].includes(status) ? 'bg-amber-50 text-amber-900 border-amber-200'
    : 'bg-slate-50 text-slate-700 border-slate-200';
  return <span className={`inline-flex rounded-lg border px-2 py-1 text-[11px] font-semibold ${color}`}>{STATUS_LABELS[status] || status}</span>;
}
