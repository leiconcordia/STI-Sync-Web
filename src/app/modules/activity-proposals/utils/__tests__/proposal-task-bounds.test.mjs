import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveTaskDateBounds,
  POST_EVENT_TASK_WINDOW_DAYS,
} from '../proposal-calculations.ts';

describe('Proposal Task Date Window (+15 days post-implementation)', () => {
  test('allows dates on and after implementation date up to +15 calendar days', () => {
    const bounds = resolveTaskDateBounds({
      eventDate: '2026-12-10',
      sessions: [{ date: '2026-12-10' }],
      isUrgent: false,
      todayStr: '2026-11-18',
    });

    assert.equal(POST_EVENT_TASK_WINDOW_DAYS, 15);
    assert.equal(bounds.standardMinDate, '2026-12-03');
    assert.equal(bounds.minTaskDate, '2026-12-03');
    assert.equal(bounds.implementationStartDate, '2026-12-10');
    assert.equal(bounds.implementationEndDate, '2026-12-10');
    assert.equal(bounds.maxTaskDate, '2026-12-25');
  });

  test('anchors +15 day ceiling to the last session date on multi-day events', () => {
    const bounds = resolveTaskDateBounds({
      eventDate: '2026-12-10',
      sessions: [{ date: '2026-12-10' }, { date: '2026-12-12' }],
      isUrgent: true,
      todayStr: '2026-11-18',
    });

    assert.equal(bounds.minTaskDate, '2026-11-18');
    assert.equal(bounds.implementationStartDate, '2026-12-10');
    assert.equal(bounds.implementationEndDate, '2026-12-12');
    assert.equal(bounds.maxTaskDate, '2026-12-27');
  });
});
