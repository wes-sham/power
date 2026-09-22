// Works out which reminders are due and delivers them as system
// notifications when allowed, falling back to in-app alerts.
import { addDays, dateFromIso, isoFromDate, occurrencesInRange, toMinutes } from './recurrence.js';
import { statusKey } from './store.js';

const GRACE_MS = 2 * 60 * 60 * 1000; // don't fire reminders more than 2h stale

export function reminderTime(item, date, settings) {
  if (item.reminder == null) return null;
  const at = item.allDay || !item.start ? toMinutes(settings.allDayReminderAt) : toMinutes(item.start);
  return new Date(dateFromIso(date, at).getTime() - item.reminder * 60000);
}

export function dueReminders(state, now = new Date()) {
  const today = isoFromDate(now);
  const occ = occurrencesInRange(state.items, addDays(today, -1), addDays(today, 2));
  const due = [];
  for (const { item, date } of occ) {
    const key = statusKey(item.id, date);
    if (state.notified[key] || state.status[key] === 'done') continue;
    const at = reminderTime(item, date, state.settings);
    if (!at) continue;
    const delta = now - at;
    if (delta >= 0 && delta < GRACE_MS) due.push({ item, date, at, key });
  }
  return due;
}

export function upcomingReminders(state, now = new Date(), limit = 3) {
  const today = isoFromDate(now);
  return occurrencesInRange(state.items, today, addDays(today, 7))
    .map(({ item, date }) => ({ item, date, at: reminderTime(item, date, state.settings) }))
    .filter((r) => r.at && r.at > now && state.status[statusKey(r.item.id, r.date)] !== 'done')
    .sort((a, b) => a.at - b.at)
    .slice(0, limit);
}

export function pruneNotified(notified, now = new Date()) {
  const cutoff = isoFromDate(new Date(now.getTime() - 3 * 86400000));
  for (const key of Object.keys(notified)) if (key.split('|')[1] < cutoff) delete notified[key];
}

export function notificationsSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export async function requestPermission() {
  if (!notificationsSupported()) return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

// Returns true if a system notification was shown.
export async function showSystemNotification(title, body, tag) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return false;
  try {
    const reg = navigator.serviceWorker && (await navigator.serviceWorker.getRegistration());
    if (reg) {
      await reg.showNotification(title, { body, tag, icon: 'icons/icon.svg', badge: 'icons/icon.svg' });
    } else {
      new Notification(title, { body, tag, icon: 'icons/icon.svg' });
    }
    return true;
  } catch {
    return false;
  }
}
