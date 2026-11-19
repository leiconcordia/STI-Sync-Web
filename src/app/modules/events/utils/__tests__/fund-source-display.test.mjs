import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ORG_FUND_SOURCE_FILTER_OPTIONS,
  SAS_FUND_SOURCE_FILTER_OPTIONS,
  resolveEventFundSourceDisplay,
} from '../fund-source-display.utils.ts';

describe('Fund Source Display & Role Categorization', () => {
  test('exposes exactly 3 SAS fund source options and 4 Org fund source options', () => {
    assert.deepEqual(
      SAS_FUND_SOURCE_FILTER_OPTIONS.map((o) => o.label),
      ['Miscellaneous Fee', 'Student Allocation', 'Non-Monetary']
    );
    assert.deepEqual(
      ORG_FUND_SOURCE_FILTER_OPTIONS.map((o) => o.label),
      ['Miscellaneous Fee', 'Club Funded', 'Student Contribution', 'Non-Monetary']
    );
  });

  test('maps SAS-authored activities strictly to Miscellaneous Fee, Student Allocation, or Non-Monetary', () => {
    const misc = resolveEventFundSourceDisplay(
      { fundingSource: 'school_budget', miscFeeBucketNames: ['Sportsfest Fee'] },
      true
    );
    assert.equal(misc.category, 'misc');
    assert.equal(misc.label, 'Miscellaneous Fee');
    assert.equal(misc.detail, 'Sportsfest Fee');

    const alloc = resolveEventFundSourceDisplay(
      { fundingSource: 'student_contributions', studentContributionRate: 150 },
      true
    );
    assert.equal(alloc.category, 'student_allocation');
    assert.equal(alloc.label, 'Student Allocation');
    assert.equal(alloc.detail, '₱150/student');

    const retainedAlloc = resolveEventFundSourceDisplay(
      { fundingSource: 'retained_sao_fund' },
      true
    );
    assert.equal(retainedAlloc.category, 'student_allocation');
    assert.equal(retainedAlloc.label, 'Student Allocation');

    const nonMonetary = resolveEventFundSourceDisplay(
      { fundingSource: 'zero_budget' },
      true
    );
    assert.equal(nonMonetary.category, 'non_monetary');
    assert.equal(nonMonetary.label, 'Non-Monetary');

    // Legacy anomalous organization_funds on a SAS row never leaks "Club Funded"
    const legacySas = resolveEventFundSourceDisplay(
      { fundingSource: 'organization_funds', totalApprovedBudget: 5000 },
      true
    );
    assert.equal(legacySas.category, 'misc');
    assert.equal(legacySas.label, 'Miscellaneous Fee');
  });

  test('maps Org-authored activities to Miscellaneous Fee, Club Funded, Student Contribution, or Non-Monetary', () => {
    assert.equal(
      resolveEventFundSourceDisplay({ fundingSource: 'school_budget' }, false).label,
      'Miscellaneous Fee'
    );
    assert.equal(
      resolveEventFundSourceDisplay({ fundingSource: 'organization_funds' }, false).label,
      'Club Funded'
    );
    assert.equal(
      resolveEventFundSourceDisplay({ fundingSource: 'student_contributions' }, false).label,
      'Student Contribution'
    );
    assert.equal(
      resolveEventFundSourceDisplay({ fundingSource: 'zero_budget' }, false).label,
      'Non-Monetary'
    );
  });

  test('infers legacy records without explicit fundingSource using budget and payable flags', () => {
    assert.equal(
      resolveEventFundSourceDisplay({ totalRequestedBudget: 0 }, true).label,
      'Non-Monetary'
    );
    assert.equal(
      resolveEventFundSourceDisplay({ studentPayablesEnabled: true, totalRequestedBudget: 2000 }, false).label,
      'Student Contribution'
    );
    assert.equal(
      resolveEventFundSourceDisplay({ totalApprovedBudget: 10000 }, false).label,
      'Club Funded'
    );
    assert.equal(
      resolveEventFundSourceDisplay({ totalApprovedBudget: 10000 }, true).label,
      'Miscellaneous Fee'
    );
  });
});
