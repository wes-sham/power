// Phone-app (Capacitor) features. In a browser every export here is a
// harmless no-op, so the same code runs on the web and in the apps.
//
// On a phone, reminders are handed to the operating system ahead of time,
// so they fire even when the app is closed.
import { addDays, isoFromDate, occurrencesInRange } from './recurrence.js';
import { reminderTime } from './reminders.js';
import { statusKey } from './store.js';

const Cap = globalThis.Capacitor;
export const isNative = Boolean(Cap?.isNativePlatform?.());
export const platform = isNative ? Cap.getPlatform() : 'web';
const plugin = (name) => Cap?.Plugins?.[name];
const Notes = () => plugin('LocalNotifications');

// iOS keeps at most 64 pending notifications per app.
const MAX_SCHEDULED = 60;
const WINDOW_DAYS = 14;

// Stable positive 31-bit id per occurrence, so rescheduling replaces rather than duplicates.
export function notificationId(key) {
  let h = 5381;
  for (let i = 0; i < key.length; i++) h = ((h << 5) + h + key.charCodeAt(i)) | 0;
  return (h & 0x7fffffff) || 1;
}

export function pendingReminders(state, now = new Date()) {
  if (!state.settings.reminders) return [];
  const today = isoFromDate(now);
  return occurrencesInRange(state.items, today, addDays(today, WINDOW_DAYS))
    .map(({ item, date }) => ({ item, date, at: reminderTime(item, date, state.settings), key: statusKey(item.id, date) }))
    .filter((r) => r.at && r.at > now && state.status[r.key] !== 'done')
    .sort((a, b) => a.at - b.at)
    .slice(0, MAX_SCHEDULED);
}

let timer = null;
let describe = (r) => ({ title: r.item.title, body: '' });

/** Reschedules OS reminders shortly after the routine changes. */
export function syncReminders(state) {
  if (!isNative) return;
  clearTimeout(timer);
  timer = setTimeout(() => scheduleNow(state).catch(() => {}), 400);
}

async function scheduleNow(state) {
  const N = Notes();
  if (!N) return;
  const pending = await N.getPending();
  if (pending.notifications.length) {
    await N.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
  }
  const perm = await N.checkPermissions();
  if (perm.display !== 'granted') return;
  const list = pendingReminders(state);
  if (!list.length) return;
  await N.schedule({
    notifications: list.map((r) => ({
      id: notificationId(r.key),
      ...describe(r),
      schedule: { at: r.at, allowWhileIdle: true },
      actionTypeId: 'REMINDER',
      extra: { id: r.item.id, date: r.date },
      smallIcon: 'ic_stat_power',
    })),
  });
}

/**
 * Hooks up native-only behavior.
 *   describeReminder(r) -> {title, body} for a notification
 *   onReminderAction({id, date, action}) — action is 'done' or 'open'
 *   onBack() -> true if the app handled the back button (e.g. closed a dialog)
 */
export async function initNative({ describeReminder, onReminderAction, onBack, onResume }) {
  if (!isNative) return;
  document.documentElement.classList.add('native', `native-${platform}`);
  describe = describeReminder;
  const N = Notes();
  if (N) {
    await N.registerActionTypes({ types: [{ id: 'REMINDER', actions: [{ id: 'done', title: 'Mark done' }] }] }).catch(() => {});
    N.addListener('localNotificationActionPerformed', ({ actionId, notification }) => {
      const { id, date } = notification.extra || {};
      if (id && date) onReminderAction({ id, date, action: actionId === 'done' ? 'done' : 'open' });
    });
  }
  const App = plugin('App');
  if (App) {
    App.addListener('backButton', () => {
      if (!onBack()) App.exitApp();
    });
    App.addListener('resume', onResume);
  }
}

/** 'granted' | 'denied' | 'prompt' */
export async function nativePermission() {
  const N = Notes();
  if (!N) return 'denied';
  const { display } = await N.checkPermissions();
  return display.startsWith('prompt') ? 'prompt' : display;
}

export async function askNativePermission() {
  const N = Notes();
  if (!N) return 'denied';
  const { display } = await N.requestPermissions();
  return display;
}

/** Android 12+: whether reminders can fire at the exact minute ('granted') or may drift ('denied'). */
export async function exactAlarmSetting() {
  const N = Notes();
  if (platform !== 'android' || !N?.checkExactNotificationSetting) return 'granted';
  try {
    return (await N.checkExactNotificationSetting()).exact_alarm;
  } catch {
    return 'granted';
  }
}

export async function openExactAlarmSetting() {
  await Notes()?.changeExactNotificationSetting?.();
}

export async function sendTestNotification() {
  const N = Notes();
  if (!N) return false;
  if ((await N.checkPermissions()).display !== 'granted') return false;
  await N.schedule({
    notifications: [{
      id: 1, title: 'Ultra Planner reminder', body: 'This is what a reminder looks like.',
      schedule: { at: new Date(Date.now() + 3000), allowWhileIdle: true }, smallIcon: 'ic_stat_power',
    }],
  });
  return true;
}

/** Saves the export to a file and opens the share sheet (Files, Drive, email…). */
export async function shareExport(json, filename) {
  const FS = plugin('Filesystem');
  const Share = plugin('Share');
  if (!FS || !Share) return false;
  const { uri } = await FS.writeFile({ path: filename, data: json, directory: 'CACHE', encoding: 'utf8' });
  await Share.share({ title: 'Ultra Planner routine backup', files: [uri] });
  return true;
}
