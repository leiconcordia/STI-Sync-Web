/**
 * src/app/modules/workflow/components/InlineRevisionBadge.tsx
 *
 * Micro-badge rendered inline next to form fields, line items, or tables
 * that have been modified or added during a revision cycle.
 */

import React from 'react';
import { Edit3, Plus, ArrowRight, HelpCircle } from 'lucide-react';
import type { DiffChangeType } from '../types/approval.types';

interface InlineRevisionBadgeProps {
  changeType?: DiffChangeType;
  oldValue?: any;
  newValue?: any;
  label?: string;
  className?: string;
}

export default function InlineRevisionBadge({
  changeType = 'modified',
  oldValue,
  newValue,
  label = 'Revised',
  className = '',
}: InlineRevisionBadgeProps) {
  if (changeType === 'unchanged') return null;

  const isAdded = changeType === 'added';
  const isRemoved = changeType === 'removed';

  const badgeBg = isAdded
    ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
    : isRemoved
    ? 'bg-rose-50 text-rose-700 border-rose-300'
    : 'bg-amber-50 text-amber-700 border-amber-300';

  const Icon = isAdded ? Plus : Edit3;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-bold rounded-md border shadow-2xs group relative cursor-help ${badgeBg} ${className}`}
      title={
        oldValue !== undefined && oldValue !== null
          ? `Previously: ${String(oldValue)}`
          : 'Modified in this revision'
      }
    >
      <Icon className="w-3 h-3 stroke-[2.5]" />
      <span>{label}</span>

      {oldValue !== undefined && oldValue !== null && (
        <span className="hidden sm:inline-flex items-center gap-1 text-[10px] opacity-80 border-l border-amber-300 pl-1.5 ml-0.5">
          <span className="line-through max-w-[80px] truncate">{String(oldValue)}</span>
          <ArrowRight className="w-2.5 h-2.5" />
          <span className="font-semibold max-w-[80px] truncate">{String(newValue)}</span>
        </span>
      )}
    </span>
  );
}
