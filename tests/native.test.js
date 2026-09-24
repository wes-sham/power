import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isNative, notificationId, pendingReminders, syncReminders } from '../js/native.js';
import { defaultSettings } from '../js/store.js';

const item = (o) => ({
  id: 'a', kind: 'event', title: 'Lab', days: [0, 1, 2, 3, 4, 5, 6], start: '14:00', end: '15:00', allDay: false,
  reminder: 15, repeat: { mode: 'weekly', end: 'never', startWeek: '2026-09-21' }, ...o,
});
const state = (items, extra = {}) => ({ items, status: {}, notified: {}, settings: defaultSettings(), ...extra });

test('outside the phone apps everything is a no-op', () => {
  assert.equal(isNative, false);
  assert.doesNotThrow(() => syncReminders(state([item()])));
});

test('notification ids are stable, positive, and distinct per day', () => {
  const a = notificationId('abc|2026-09-22');
  assert.equal(a, notificationId('abc|2026-09-22'));
  assert.ok(a > 0 && a <= 0x7fffffff);
  assert.notEqual(a, notificationId('abc|2026-09-23'));
});

test('schedules the next two weeks of future, unfinished reminders', () => {
  const now = new Date(2026, 8, 22, 14, 0); // after today's 13:45 reminder
  const s = state([item()], { status: { 'a|2026-09-23': 'done' } });
  const list = pendingReminders(s, now);
  assert.equal(list[0].date, '2026-09-24', "skips today's past reminder and tomorrow's finished one");
  assert.equal(list.at(-1).date, '2026-10-06');
  assert.ok(list.every((r) => r.at > now));
});

test('caps at 60 so iOS never drops any', () => {
  const many = Array.from({ length: 10 }, (_, i) => item({ id: `i${i}` }));
  assert.equal(pendingReminders(state(many), new Date(2026, 8, 22, 9)).length, 60);
});

test('nothing is scheduled when reminders are turned off', () => {
  const s = state([item()]);
  s.settings.reminders = false;
  assert.equal(pendingReminders(s, new Date(2026, 8, 22, 9)).length, 0);
});
