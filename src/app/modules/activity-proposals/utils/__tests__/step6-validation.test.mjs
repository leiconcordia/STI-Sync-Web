import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkProjectedBalance,
  validateBucketAllocations,
  validateStep6FinancialProjections,
} from '../proposal-calculations.ts';

describe('Step 6 Financial Validation Guard (Non-Zero & Complete Inputs)', () => {
  test('blocks student_contributions when rate, student count, or Section B baseline budget are zero', () => {
    const allZeroErrors = validateStep6FinancialProjections({
      fundingSource: 'student_contributions',
      studentContributionRate: 0,
      studentContributionTargetCount: 0,
      financialProjections: {
        revenues: [{ id: 'rev-1', description: '', lastYearActual: 0, thisYearProposed: 0, totalAmount: 0, adjustment: 0, remarks: '' }],
        expenses: [{ id: 'exp-1', description: '', lastYearActual: 0, thisYearProposed: 0, totalAmount: 0, adjustment: 0, remarks: '' }],
        totalRevenue: 0,
        totalExpenses: 0,
        balance: 0,
      },
    });
    assert.ok(allZeroErrors.fundingSource);
    assert.ok(allZeroErrors.expenditures);

    const zeroBudgetOnlyErrors = validateStep6FinancialProjections({
      fundingSource: 'student_contributions',
      studentContributionRate: 100,
      studentContributionTargetCount: 50,
      financialProjections: {
        revenues: [{ id: 'rev-contrib', description: 'Student Contrib', lastYearActual: 0, thisYearProposed: 5000, totalAmount: 5000, adjustment: 0, remarks: '' }],
        expenses: [{ id: 'exp-1', description: '', lastYearActual: 0, thisYearProposed: 0, totalAmount: 0, adjustment: 0, remarks: '' }],
        totalRevenue: 5000,
        totalExpenses: 0,
        balance: 5000,
      },
    });
    assert.equal(zeroBudgetOnlyErrors.fundingSource, undefined);
    assert.ok(zeroBudgetOnlyErrors.expenditures);
  });

  test('blocks school_budget (Miscellaneous Fee) when no bucket is selected or Section B budget is zero', () => {
    const noBucketZeroCheck = validateBucketAllocations({
      fundingSource: 'school_budget',
      totalExpenses: 0,
      allocations: [],
    });
    assert.equal(noBucketZeroCheck.isValid, false);
    assert.ok(noBucketZeroCheck.summaryError);

    const missingInputsErrors = validateStep6FinancialProjections({
      fundingSource: 'school_budget',
      allocations: [],
      financialProjections: {
        revenues: [{ id: 'rev-1', description: '', lastYearActual: 0, thisYearProposed: 0, totalAmount: 0, adjustment: 0, remarks: '' }],
        expenses: [{ id: 'exp-1', description: '', lastYearActual: 0, thisYearProposed: 0, totalAmount: 0, adjustment: 0, remarks: '' }],
        totalRevenue: 0,
        totalExpenses: 0,
        balance: 0,
      },
    });
    assert.ok(missingInputsErrors.bucketAllocations);
    assert.ok(missingInputsErrors.expenditures);

    const validMiscErrors = validateStep6FinancialProjections({
      fundingSource: 'school_budget',
      allocations: [
        {
          bucketId: 'b1',
          bucketName: 'Sportsfest Fee',
          fundType: 'misc_fee',
          allocatedAmount: 3000,
          availableAmount: 10000,
        },
      ],
      financialProjections: {
        revenues: [{ id: 'rev-bucket-b1', description: 'Sportsfest Fee', lastYearActual: 0, thisYearProposed: 10000, totalAmount: 10000, adjustment: 0, remarks: '' }],
        expenses: [{ id: 'exp-1', description: 'Uniforms', lastYearActual: 0, thisYearProposed: 3000, totalAmount: 3000, adjustment: 0, remarks: '' }],
        totalRevenue: 10000,
        totalExpenses: 3000,
        balance: 7000,
      },
    });
    assert.deepEqual(validMiscErrors, {});
  });

  test('allows zero_budget (Non-Monetary) to advance cleanly with ₱0.00 projections', () => {
    const nonMonetaryErrors = validateStep6FinancialProjections({
      fundingSource: 'zero_budget',
      financialProjections: {
        revenues: [],
        expenses: [{ id: 'exp-zero', description: '', lastYearActual: 0, thisYearProposed: 0, totalAmount: 0, adjustment: 0, remarks: '' }],
        totalRevenue: 0,
        totalExpenses: 0,
        balance: 0,
      },
    });
    assert.deepEqual(nonMonetaryErrors, {});
  });

  test('blocks submission when asking budget exceeds system-configured source revenue', () => {
    const deficitCheck = checkProjectedBalance(
      {
        revenues: [
          { id: 'rev-bucket-b1', description: 'Sportsfest Fee', lastYearActual: 0, thisYearProposed: 4000, totalAmount: 4000, adjustment: 0, remarks: '' },
        ],
        expenses: [
          { id: 'exp-1', description: 'Stage Setup', lastYearActual: 0, thisYearProposed: 6000, totalAmount: 6000, adjustment: 0, remarks: '' },
        ],
        totalRevenue: 4000,
        totalExpenses: 6000,
        balance: -2000,
      },
      'school_budget'
    );
    assert.equal(deficitCheck.isDeficit, true);

    const deficitErrors = validateStep6FinancialProjections({
      fundingSource: 'school_budget',
      allocations: [
        {
          bucketId: 'b1',
          bucketName: 'Sportsfest Fee',
          fundType: 'misc_fee',
          allocatedAmount: 6000,
          availableAmount: 4000,
        },
      ],
      financialProjections: {
        revenues: [{ id: 'rev-bucket-b1', description: 'Sportsfest Fee', lastYearActual: 0, thisYearProposed: 4000, totalAmount: 4000, adjustment: 0, remarks: '' }],
        expenses: [{ id: 'exp-1', description: 'Stage Setup', lastYearActual: 0, thisYearProposed: 6000, totalAmount: 6000, adjustment: 0, remarks: '' }],
        totalRevenue: 4000,
        totalExpenses: 6000,
        balance: -2000,
      },
    });
    assert.ok(deficitErrors.projectedBalance);
    assert.ok(deficitErrors.bucketAllocations);
  });
});
