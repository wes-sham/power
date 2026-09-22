import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  weekday, mondayOf, addDays, occursOn, occurrencesInRange, layoutLanes, describeRepeat,
  isoWeekNumber, lastWeekOf,
} from '../js/recurrence.js';

const MON = '2026-09-21'; // a Monday
const ev = (days, repeat, extra = {}) => ({ id: 'x', title: 'Class', days, repeat: { startWeek: MON, ...repeat }, ...extra });

test('weekday is Monday-based and DST-proof', () => {
  assert.equal(weekday('2026-09-21'), 0);
  assert.equal(weekday('2026-09-27'), 6);
  assert.equal(weekday('2026-03-08'), 6); // US DST start, a Sunday
  assert.equal(mondayOf('2026-11-01'), '2026-10-26'); // US DST end
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

test('every week, ongoing', () => {
  const item = ev([0, 2, 4], { mode: 'weekly', end: 'never' });
  assert.ok(occursOn(item, '2026-09-21'));
  assert.ok(occursOn(item, '2026-09-23'));
  assert.ok(!occursOn(item, '2026-09-22'));
  assert.ok(occursOn(item, '2027-06-04'));
  assert.ok(!occursOn(item, '2026-09-18'), 'nothing before the starting week');
});

test('every week for a set number of weeks', () => {
  const item = ev([1], { mode: 'weekly', end: 'count', count: 3 });
  const dates = occurrencesInRange([item], MON, addDays(MON, 60)).map((o) => o.date);
  assert.deepEqual(dates, ['2026-09-22', '2026-09-29', '2026-10-06']);
  assert.equal(lastWeekOf(item.repeat), '2026-10-05');
});

test('every N weeks, counting occurrences', () => {
  const item = ev([3], { mode: 'interval', every: 2, end: 'count', count: 3 });
  const dates = occurrencesInRange([item], MON, addDays(MON, 90)).map((o) => o.date);
  assert.deepEqual(dates, ['2026-09-24', '2026-10-08', '2026-10-22']);
});

test('every N weeks, ongoing, starting mid-week still anchors to that week', () => {
  const item = ev([0], { mode: 'interval', every: 4, end: 'never', startWeek: '2026-09-24' });
  assert.ok(occursOn(item, '2026-09-21'));
  assert.ok(!occursOn(item, '2026-09-28'));
  assert.ok(occursOn(item, '2026-10-19'));
});

test('one week only', () => {
  const item = ev([2, 4], { mode: 'once', end: 'never', startWeek: '2026-09-28' });
  const dates = occurrencesInRange([item], MON, addDays(MON, 30)).map((o) => o.date);
  assert.deepEqual(dates, ['2026-09-30', '2026-10-02']);
});

test('until a date is inclusive', () => {
  const item = ev([4], { mode: 'weekly', end: 'until', until: '2026-10-02' });
  assert.ok(occursOn(item, '2026-10-02'));
  assert.ok(!occursOn(item, '2026-10-09'));
});

test('skipped single days', () => {
  const item = ev([0], { mode: 'weekly', end: 'never' }, { skip: ['2026-09-28'] });
  assert.ok(occursOn(item, '2026-09-21'));
  assert.ok(!occursOn(item, '2026-09-28'));
  assert.ok(occursOn(item, '2026-10-05'));
});

test('describeRepeat reads like a sentence', () => {
  assert.equal(describeRepeat(ev([0, 2, 4], { mode: 'weekly', end: 'count', count: 15 })),
    'Every week · Mon, Wed, Fri · 15 times from Sep 21');
  assert.equal(describeRepeat(ev([1, 3], { mode: 'interval', every: 2, end: 'never' })),
    'Every 2 weeks · Tue, Thu · from Sep 21, ongoing');
  assert.equal(describeRepeat(ev([0, 1, 2, 3, 4], { mode: 'once', end: 'never' })), 'Weekdays · week of Sep 21 only');
});

test('ISO week numbers', () => {
  assert.equal(isoWeekNumber('2026-09-22'), 39);
  assert.equal(isoWeekNumber('2027-01-01'), 53);
  assert.equal(isoWeekNumber('2026-01-01'), 1);
});

test('overlapping blocks get side-by-side lanes', () => {
  const blocks = layoutLanes([
    { id: 'a', startMin: 540, endMin: 600 },
    { id: 'b', startMin: 570, endMin: 630 },
    { id: 'c', startMin: 600, endMin: 660 },
    { id: 'd', startMin: 700, endMin: 760 },
  ]);
  const by = Object.fromEntries(blocks.map((b) => [b.id, b]));
  assert.equal(by.a.lane, 0);
  assert.equal(by.b.lane, 1);
  assert.equal(by.c.lane, 0, 'reuses the lane a freed');
  assert.equal(by.a.lanes, 2);
  assert.equal(by.d.lanes, 1);
});
