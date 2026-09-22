// State shape, persistence, and the sample routine shown on first launch.
import { addDays, mondayOf, isoFromDate, weekday } from './recurrence.js';

const KEY = 'power.routine.v1';

export const COLORS = {
  blue: '#3f6fd6',
  green: '#2f9a68',
  teal: '#1c93a8',
  amber: '#cf8f16',
  red: '#d0543f',
  purple: '#8759cc',
  slate: '#67747d',
};

export const STATUSES = ['todo', 'doing', 'done'];
export const STATUS_LABEL = { todo: 'Not started', doing: 'Working', done: 'Done' };

export function defaultSettings() {
  return {
    view: 'week',
    dayStart: 7,
    dayEnd: 22,
    weekends: true,
    clock24: false,
    hideDone: false,
    reminders: false,
    defaultLead: 10,
    allDayReminderAt: '08:00',
  };
}

export function uid() {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}

export function statusKey(id, date) {
  return `${id}|${date}`;
}

export function normalize(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  return {
    items: Array.isArray(s.items) ? s.items.filter((i) => i && i.id && Array.isArray(i.days)) : [],
    status: s.status && typeof s.status === 'object' ? s.status : {},
    notified: s.notified && typeof s.notified === 'object' ? s.notified : {},
    settings: { ...defaultSettings(), ...(s.settings || {}) },
    sample: Boolean(s.sample),
  };
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch {
    /* storage unavailable: fall through to the sample */
  }
  return null;
}

export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function emptyState(settings = defaultSettings()) {
  return { items: [], status: {}, notified: {}, settings, sample: false };
}

// A realistic student week, anchored to whatever week it is today.
export function sampleState(today = isoFromDate(new Date())) {
  const mon = mondayOf(today);
  const termStart = addDays(mon, -14);
  const termEnd = addDays(mon, 7 * 11 + 4);
  const weekly = (startWeek = termStart, until = termEnd) => ({ mode: 'weekly', end: 'until', until, startWeek });
  const item = (o) => ({
    id: uid(), kind: 'event', start: null, end: null, allDay: false, color: 'blue',
    notes: '', reminder: null, skip: [], ...o,
  });

  const items = [
    item({ title: 'Calculus II', days: [0, 2, 4], start: '09:00', end: '09:50', color: 'blue',
      notes: 'Hall B 104 · Prof. Okafor', reminder: 10, repeat: weekly() }),
    item({ title: 'Chemistry lecture', days: [1, 3], start: '11:00', end: '12:15', color: 'green',
      notes: 'Science Center 2', reminder: 10, repeat: weekly() }),
    item({ title: 'Chem lab', days: [3], start: '14:00', end: '16:50', color: 'teal',
      notes: 'Bring goggles + lab notebook', reminder: 30,
      repeat: { mode: 'interval', every: 2, end: 'count', count: 7, startWeek: termStart } }),
    item({ title: 'English seminar', days: [1, 3], start: '13:00', end: '14:15', color: 'purple',
      reminder: 10, repeat: weekly() }),
    item({ title: 'Library shift', days: [1], start: '17:00', end: '20:00', color: 'amber',
      reminder: 30, repeat: { mode: 'weekly', end: 'never', startWeek: termStart } }),
    item({ title: 'Library shift', days: [5], start: '10:00', end: '14:00', color: 'amber',
      reminder: 30, repeat: { mode: 'weekly', end: 'never', startWeek: termStart } }),
    item({ title: 'Gym', days: [0, 2, 4], start: '07:00', end: '08:00', color: 'slate',
      repeat: { mode: 'weekly', end: 'never', startWeek: termStart } }),
    item({ title: 'Robotics club', days: [2], start: '18:30', end: '20:00', color: 'purple',
      reminder: 15, repeat: { mode: 'interval', every: 2, end: 'never', startWeek: addDays(mon, -7) } }),
    item({ title: 'Chem midterm', days: [2], start: '13:00', end: '14:30', color: 'red',
      notes: 'Chapters 1–6', reminder: 60, repeat: { mode: 'once', end: 'never', startWeek: addDays(mon, 7) } }),
    item({ kind: 'task', title: 'Calc problem set due', days: [4], start: '17:00', end: null, color: 'red',
      reminder: 60, repeat: weekly() }),
    item({ kind: 'task', title: 'Seminar reading', days: [0, 2], allDay: true, color: 'purple',
      repeat: weekly() }),
    item({ kind: 'task', title: 'Laundry', days: [6], allDay: true, color: 'slate',
      repeat: { mode: 'weekly', end: 'never', startWeek: termStart } }),
    item({ kind: 'task', title: 'Pay phone bill', days: [0], allDay: true, color: 'amber',
      repeat: { mode: 'interval', every: 4, end: 'never', startWeek: mon } }),
  ];

  // Mark the part of this week that's already behind us.
  const status = {};
  const todayIdx = weekday(today);
  const byTitle = (t) => items.filter((i) => i.title === t);
  for (let d = 0; d < todayIdx; d++) {
    const date = addDays(mon, d);
    for (const i of items) if (i.days.includes(d)) status[statusKey(i.id, date)] = 'done';
  }
  byTitle('Calc problem set due').forEach((i) => (status[statusKey(i.id, addDays(mon, 4))] = 'doing'));

  return { items, status, notified: {}, settings: defaultSettings(), sample: true };
}
