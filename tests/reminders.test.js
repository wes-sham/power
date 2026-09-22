import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dueReminders, upcomingReminders, reminderTime, pruneNotified } from '../js/reminders.js';
import { defaultSettings, sampleState, statusKey } from '../js/store.js';

const item = (o) => ({
  id: 'a', kind: 'event', title: 'Lab', days: [1], start: '14:00', end: '15:00', allDay: false,
  reminder: 15, repeat: { mode: 'weekly', end: 'never', startWeek: '2026-09-21' }, ...o,
});
const state = (items, extra = {}) => ({ items, status: {}, notified: {}, settings: defaultSettings(), ...extra });

test('reminder fires at start minus lead time', () => {
  const s = state([item()]);
  assert.deepEqual(reminderTime(item(), '2026-09-22', s.settings), new Date(2026, 8, 22, 13, 45));
  assert.equal(dueReminders(s, new Date(2026, 8, 22, 13, 44)).length, 0);
  const due = dueReminders(s, new Date(2026, 8, 22, 13, 46));
  assert.equal(due.length, 1);
  assert.equal(due[0].key, 'a|2026-09-22');
});

test('already-notified, done, and stale reminders are skipped', () => {
  const now = new Date(2026, 8, 22, 13, 50);
  assert.equal(dueReminders(state([item()], { notified: { 'a|2026-09-22': 1 } }), now).length, 0);
  assert.equal(dueReminders(state([item()], { status: { 'a|2026-09-22': 'done' } }), now).length, 0);
  assert.equal(dueReminders(state([item()]), new Date(2026, 8, 22, 18, 0)).length, 0);
});

test('all-day tasks use the all-day reminder time', () => {
  const task = item({ kind: 'task', allDay: true, start: null, end: null, reminder: 0 });
  const s = state([task]);
  assert.deepEqual(reminderTime(task, '2026-09-22', s.settings), new Date(2026, 8, 22, 8, 0));
});

test('one-day-early reminders fire the day before', () => {
  const s = state([item({ reminder: 1440 })]);
  assert.equal(dueReminders(s, new Date(2026, 8, 21, 14, 1)).length, 1);
});

test('upcoming reminders are sorted and exclude items without one', () => {
  const s = state([item(), item({ id: 'b', title: 'Gym', days: [1], start: '07:00', end: '08:00', reminder: null })]);
  const up = upcomingReminders(s, new Date(2026, 8, 22, 9, 0));
  assert.equal(up[0].item.id, 'a');
  assert.ok(up.every((r) => r.item.id === 'a'));
});

test('old notified keys get pruned', () => {
  const n = { 'a|2026-09-01': 1, 'a|2026-09-22': 1 };
  pruneNotified(n, new Date(2026, 8, 22));
  assert.deepEqual(Object.keys(n), ['a|2026-09-22']);
});

test('sample routine is anchored to the current week and marks past days done', () => {
  const s = sampleState('2026-09-23'); // a Wednesday
  assert.ok(s.items.length > 8);
  const calc = s.items.find((i) => i.title === 'Calculus II');
  assert.equal(s.status[statusKey(calc.id, '2026-09-21')], 'done');
  assert.equal(s.status[statusKey(calc.id, '2026-09-23')], undefined);
});
