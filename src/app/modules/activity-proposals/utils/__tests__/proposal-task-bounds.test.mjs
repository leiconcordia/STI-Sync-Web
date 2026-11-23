import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveTaskDateBounds,
  check15DayRule,
  POST_EVENT_TASK_WINDOW_DAYS,
} from '../proposal-calculations.ts';

describe('Proposal Task Date Window (Today – Implementation Date)', () => {
  test('allows dates strictly from today up to the implementation date', () => {
    const bounds = resolveTaskDateBounds({
      eventDate: '2026-12-10',
      sessions: [{ date: '2026-12-10' }],
      isUrgent: false,
      todayStr: '2026-11-18',
    });

    assert.equal(POST_EVENT_TASK_WINDOW_DAYS, 0);
    assert.equal(bounds.todayStr, '2026-11-18');
    assert.equal(bounds.minTaskDate, '2026-11-18');
    assert.equal(bounds.implementationStartDate, '2026-12-10');
    assert.equal(bounds.implementationEndDate, '2026-12-10');
    assert.equal(bounds.maxTaskDate, '2026-12-10');
  });

  test('anchors ceiling to the last session date on multi-day events', () => {
    const bounds = resolveTaskDateBounds({
      eventDate: '2026-12-10',
      sessions: [{ date: '2026-12-10' }, { date: '2026-12-12' }],
      isUrgent: true,
      todayStr: '2026-11-18',
    });

    assert.equal(bounds.minTaskDate, '2026-11-18');
    assert.equal(bounds.implementationStartDate, '2026-12-10');
    assert.equal(bounds.implementationEndDate, '2026-12-12');
    assert.equal(bounds.maxTaskDate, '2026-12-12');
  });

  test('check15DayRule ignores Step 5 preparatory task dates when implementation date is >= 15 days away', () => {
    const res = check15DayRule(
      '2026-11-24',
      [{ id: 's1', title: 'Main', date: '2026-12-15', startTime: '08:00', endTime: '12:00', venueName: 'Gym' }],
      [{ id: 't1', taskName: 'Book Venue', assignedPerson: 'Officer', completionDate: '2026-11-25' }],
      '2026-12-15'
    );

    assert.equal(res.isCompliant, true);
    assert.equal(res.daysDiff, 21);
    assert.equal(res.earliestDate, '2026-12-15');
  });

  test('check15DayRule flags non-compliant only when implementation/session date is < 15 days away', () => {
    const res = check15DayRule(
      '2026-11-24',
      [{ id: 's1', title: 'Main', date: '2026-12-01', startTime: '08:00', endTime: '12:00', venueName: 'Gym' }],
      [],
      '2026-12-01'
    );

    assert.equal(res.isCompliant, false);
    assert.equal(res.daysDiff, 7);
    assert.equal(res.earliestDate, '2026-12-01');
  });
});
