import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveTaskDateBounds,
  check15DayRule,
  POST_EVENT_TASK_WINDOW_DAYS,
} from '../proposal-calculations.ts';

describe('Proposal Task Date Window (Submission + 15 Days – Implementation Date)', () => {
  test('standard AP requires task dates from submission + 15 days up to implementation date', () => {
    const bounds = resolveTaskDateBounds({
      eventDate: '2026-12-10',
      sessions: [{ date: '2026-12-10' }],
      isUrgent: false,
      submissionDateStr: '2026-11-18',
      todayStr: '2026-11-20',
    });

    assert.equal(POST_EVENT_TASK_WINDOW_DAYS, 0);
    assert.equal(bounds.todayStr, '2026-11-20');
    assert.equal(bounds.submissionDateStr, '2026-11-18');
    assert.equal(bounds.standardMinDate, '2026-12-03');
    assert.equal(bounds.minTaskDate, '2026-12-03');
    assert.equal(bounds.implementationStartDate, '2026-12-10');
    assert.equal(bounds.implementationEndDate, '2026-12-10');
    assert.equal(bounds.maxTaskDate, '2026-12-10');
  });

  test('supports formatted submissionDate strings (e.g. "November 25, 2026")', () => {
    const bounds = resolveTaskDateBounds({
      eventDate: '2026-12-20',
      sessions: [{ date: '2026-12-20' }],
      isUrgent: false,
      submissionDateStr: 'November 25, 2026',
      todayStr: '2026-11-25',
    });

    assert.equal(bounds.submissionDateStr, '2026-11-25');
    assert.equal(bounds.standardMinDate, '2026-12-10');
    assert.equal(bounds.minTaskDate, '2026-12-10');
    assert.equal(bounds.maxTaskDate, '2026-12-20');
  });

  test('urgent AP unlocks task window from submission date up to last session date on multi-day events', () => {
    const bounds = resolveTaskDateBounds({
      eventDate: '2026-11-28',
      sessions: [{ date: '2026-11-28' }, { date: '2026-11-30' }],
      isUrgent: true,
      submissionDateStr: '2026-11-18',
      todayStr: '2026-11-18',
    });

    assert.equal(bounds.minTaskDate, '2026-11-18');
    assert.equal(bounds.standardMinDate, '2026-12-03');
    assert.equal(bounds.implementationStartDate, '2026-11-28');
    assert.equal(bounds.implementationEndDate, '2026-11-30');
    assert.equal(bounds.maxTaskDate, '2026-11-30');
  });

  test('check15DayRule passes when initial task and implementation date are >= 15 days from submission', () => {
    const res = check15DayRule(
      '2026-11-24',
      [{ id: 's1', title: 'Main', date: '2026-12-15', startTime: '08:00', endTime: '12:00', venueName: 'Gym' }],
      [{ id: 't1', taskName: 'Book Venue', assignedPerson: 'Officer', completionDate: '2026-12-09' }],
      '2026-12-15'
    );

    assert.equal(res.isCompliant, true);
    assert.equal(res.daysDiff, 15);
    assert.equal(res.earliestDate, '2026-12-09');
  });

  test('check15DayRule flags non-compliant when an initial task is < 15 days from submission', () => {
    const res = check15DayRule(
      '2026-11-24',
      [{ id: 's1', title: 'Main', date: '2026-12-15', startTime: '08:00', endTime: '12:00', venueName: 'Gym' }],
      [{ id: 't1', taskName: 'Book Venue', assignedPerson: 'Officer', completionDate: '2026-11-30' }],
      '2026-12-15'
    );

    assert.equal(res.isCompliant, false);
    assert.equal(res.daysDiff, 6);
    assert.equal(res.earliestDate, '2026-11-30');
  });

  test('check15DayRule flags non-compliant when implementation/session date is < 15 days from submission', () => {
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
