import type { ComputedBucketBalance, MiscFeeSemesterTerm } from '../types/misc-fee.types';

function fmtAmount(value: number): string {
  return (Number(value) || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export interface FormattedBucketBreakdown {
  bucketId: string;
  bucketName: string;
  description: string;
  grossPool: number;
  disbursed: number;
  returnedSurplus: number;
  availableAmount: number;
  remarks: string;
}

export interface FormattedFundSourceResult {
  description: string;
  perBucket: FormattedBucketBreakdown[];
  totalGrossPool: number;
  totalDisbursed: number;
  totalReturnedSurplus: number;
  totalAvailable: number;
  remarks: string;
}

function buildBucketTermLines(
  item: ComputedBucketBalance,
  isSecondSem: boolean
): { tertiaryBlock: string | null; shsBlock: string | null } {
  const b = item.bucket;
  const col1Rate = Number(b.college1stSemRateTY) || 0;
  const col2Rate = Number(b.college2ndSemRateTY) || 0;
  const shsRate = Number(b.shsRateTY) || 0;
  const shs2ndRate = Number(b.shs2ndSemRateTY) || 0;
  const isGrade12Only = String(b.level || '').toLowerCase().includes('grade 12');

  const tLines: string[] = [];
  const sLines: string[] = [];

  if (isSecondSem) {
    const hasCarryOver = Number(item.carryOverFrom1stSem || 0) > 0;
    const has2ndSemData = col2Rate > 0;

    if (hasCarryOver || has2ndSemData || col1Rate > 0) {
      tLines.push(b.particular);
      if (hasCarryOver) {
        tLines.push(
          `1st Sem Carried Over (Unspent Balance): ₱${fmtAmount(item.carryOverFrom1stSem)}`
        );
      }
      if (has2ndSemData) {
        tLines.push(`2nd Semester (₱${fmtAmount(col2Rate)}/student)`);
        tLines.push(
          `Tertiary (₱${fmtAmount(col2Rate)} x ${item.college2ndSemEnrolled.toLocaleString()} students) = ₱${fmtAmount(item.college2ndSemPool)}`
        );
      }
    }

    if (shs2ndRate > 0) {
      const scopeTag = isGrade12Only ? ' (Grade 12)' : '';
      const shs2ndCount = item.shs2ndSemEnrolled ?? item.shsEnrolled;
      const shs2ndAmount = item.shs2ndSemPool ?? shs2ndRate * shs2ndCount;
      sLines.push(
        `${b.particular}${scopeTag} (2nd Sem SHS) – ₱${fmtAmount(shs2ndRate)} x ${shs2ndCount.toLocaleString()} students = ₱${fmtAmount(shs2ndAmount)}`
      );
    } else if (shsRate > 0 && !hasCarryOver) {
      const scopeTag = isGrade12Only ? ' (Grade 12)' : '';
      sLines.push(
        `${b.particular}${scopeTag} – Annual SHS (1st Sem: ₱${fmtAmount(shsRate)} x ${item.shsEnrolled.toLocaleString()} students = ₱${fmtAmount(item.shsAnnualPool)}; 2nd Sem Carry-Over: ₱0.00)`
      );
    }
  } else {
    if (col1Rate > 0) {
      tLines.push(b.particular);
      tLines.push(
        `₱${fmtAmount(col1Rate)} x ${item.college1stSemEnrolled.toLocaleString()} students = ₱${fmtAmount(item.college1stSemPool)}`
      );
    }
    if (shsRate > 0) {
      const scopeTag = isGrade12Only ? ' (Grade 12)' : '';
      sLines.push(
        `${b.particular}${scopeTag} – ₱${fmtAmount(shsRate)} x ${item.shsEnrolled.toLocaleString()} students = ₱${fmtAmount(item.shsAnnualPool)}`
      );
    }
  }

  return {
    tertiaryBlock: tLines.length > 0 ? tLines.join('\n') : null,
    shsBlock: sLines.length > 0 ? sLines.join('\n') : null,
  };
}

/**
 * Generates an isolated, spaced breakdown for a SINGLE Miscellaneous Fee bucket,
 * ideal for creating one separate Revenue projection row per bucket.
 */
export function formatSingleBucketDescription(
  item: ComputedBucketBalance,
  activeSemester: MiscFeeSemesterTerm = '1st Semester'
): FormattedBucketBreakdown {
  const isSecondSem = activeSemester === '2nd Semester';
  const { tertiaryBlock, shsBlock } = buildBucketTermLines(item, isSecondSem);

  const sections: string[] = [];
  if (tertiaryBlock) sections.push(`(TERTIARY)\n${tertiaryBlock}`);
  if (shsBlock) sections.push(`(SHS)\n${shsBlock}`);

  const grossPool = Math.round((Number(item.currentPool) || 0) * 100) / 100;
  const disbursed = Math.round((Number(item.currentDisbursed) || 0) * 100) / 100;
  const returnedSurplus = Math.round((Number(item.currentReturnedSurplus) || 0) * 100) / 100;
  const availableAmount = Math.round((Number(item.currentAvailable) || 0) * 100) / 100;

  if (disbursed > 0 || returnedSurplus > 0) {
    sections.push(`Combined Available Amount: ₱${fmtAmount(availableAmount)}`);
  } else {
    sections.push(`Total Amount: ₱${fmtAmount(availableAmount)}`);
  }

  return {
    bucketId: item.bucket.id,
    bucketName: item.bucket.particular,
    description: sections.join('\n\n'),
    grossPool,
    disbursed,
    returnedSurplus,
    availableAmount,
    remarks:
      item.bucket.remarks ||
      `Miscellaneous Fee Pool (${item.bucket.particular}) • Available: ₱${fmtAmount(availableAmount)}`,
  };
}

/**
 * Generates spaced multi-line breakdown across one or more selected Miscellaneous Fee buckets
 * along with separate per-bucket breakdown objects for individual Revenue rows.
 */
export function formatMiscFeeFundDescription(
  selectedBuckets: ComputedBucketBalance[],
  activeSemester: MiscFeeSemesterTerm = '1st Semester'
): FormattedFundSourceResult {
  if (!selectedBuckets || selectedBuckets.length === 0) {
    return {
      description: '',
      perBucket: [],
      totalGrossPool: 0,
      totalDisbursed: 0,
      totalReturnedSurplus: 0,
      totalAvailable: 0,
      remarks: '',
    };
  }

  const isSecondSem = activeSemester === '2nd Semester';
  const perBucket = selectedBuckets.map((item) =>
    formatSingleBucketDescription(item, activeSemester)
  );

  const tertiaryBlocks: string[] = [];
  const shsBlocks: string[] = [];
  let totalGrossPool = 0;
  let totalDisbursed = 0;
  let totalReturnedSurplus = 0;
  let totalAvailable = 0;

  selectedBuckets.forEach((item, idx) => {
    const { tertiaryBlock, shsBlock } = buildBucketTermLines(item, isSecondSem);
    if (tertiaryBlock) tertiaryBlocks.push(tertiaryBlock);
    if (shsBlock) shsBlocks.push(shsBlock);

    totalGrossPool += perBucket[idx].grossPool;
    totalDisbursed += perBucket[idx].disbursed;
    totalReturnedSurplus += perBucket[idx].returnedSurplus;
    totalAvailable += perBucket[idx].availableAmount;
  });

  const sections: string[] = [];
  if (tertiaryBlocks.length > 0) {
    sections.push(`(TERTIARY)\n${tertiaryBlocks.join('\n\n')}`);
  }
  if (shsBlocks.length > 0) {
    sections.push(`(SHS)\n${shsBlocks.join('\n\n')}`);
  }

  if (totalDisbursed > 0 || totalReturnedSurplus > 0) {
    sections.push(`Combined Available Amount: ₱${fmtAmount(totalAvailable)}`);
  } else {
    sections.push(`Total Amount: ₱${fmtAmount(totalAvailable)}`);
  }

  const remarks =
    selectedBuckets.length === 1
      ? perBucket[0].remarks
      : `Combined Miscellaneous Fee Pools (${selectedBuckets.map((b) => b.bucket.particular).join(' + ')}) • Available: ₱${fmtAmount(totalAvailable)}`;

  return {
    description: sections.join('\n\n'),
    perBucket,
    totalGrossPool: Math.round(totalGrossPool * 100) / 100,
    totalDisbursed: Math.round(totalDisbursed * 100) / 100,
    totalReturnedSurplus: Math.round(totalReturnedSurplus * 100) / 100,
    totalAvailable: Math.round(totalAvailable * 100) / 100,
    remarks,
  };
}

/**
 * Formats Projected Revenue description for a Student Contribution event
 * with optional live audience filter breakdown and blank-line spacing.
 */
export function formatStudentContributionDescription(params: {
  ratePerStudent: number;
  targetStudents: number;
  audienceSummary?: string;
  ownerLabel?: string;
}): { description: string; totalProjected: number; remarks: string } {
  const rate = Math.max(0, Number(params.ratePerStudent) || 0);
  const count = Math.max(0, Math.round(Number(params.targetStudents) || 0));
  const totalProjected = Math.round(rate * count * 100) / 100;
  const ownerDestination = params.ownerLabel || 'Retained Student Activity Fund';

  const lines = ['Student Contribution'];
  if (params.audienceSummary) {
    lines.push(`Target: ${params.audienceSummary}`);
  }
  lines.push(
    `₱${fmtAmount(rate)} x ${count.toLocaleString()} students = ₱${fmtAmount(totalProjected)}`
  );

  return {
    description: lines.join('\n'),
    totalProjected,
    remarks: `Direct collection from students; any unspent surplus stays in ${ownerDestination}.`,
  };
}

/**
 * Formats Projected Revenue description when applying Accumulated Retained Student Contribution Surpluses
 * or Organization Treasury Balance.
 */
export function formatRetainedFundDescription(params: {
  ownerType: 'sao' | 'organization';
  organizationName?: string;
  availableBalance: number;
  labelOverride?: string;
}): { description: string; remarks: string } {
  const balance = Math.max(0, Number(params.availableBalance) || 0);
  if (params.ownerType === 'organization') {
    const orgLabel = params.organizationName
      ? `${params.organizationName} Treasury`
      : 'Organization Treasury';
    return {
      description: `${params.labelOverride || `${orgLabel} / Retained Student Activity Fund`}\nAvailable Balance: ₱${fmtAmount(balance)}`,
      remarks: 'Accumulated organization treasury & retained student contribution surpluses (persistent across SY).',
    };
  }
  return {
    description: `${params.labelOverride || 'Previous Student Contribution Bucket (Retained Surplus)'}\nAccumulated Available Balance: ₱${fmtAmount(balance)}`,
    remarks: 'Detected surplus bucket from previous Student Contribution activities (never mixes with Misc Fees).',
  };
}
