// Date + recurrence helpers. Dates are plain ISO strings ("2026-09-22") so
// week math never drifts across daylight-saving changes. Weekdays are
// Monday-based: 0 = Mon … 6 = Sun.

const DAY_MS = 86400000;

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function toDayNum(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

export function fromDayNum(n) {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

export function weekday(iso) {
  // 1970-01-01 was a Thursday (index 3).
  return (((toDayNum(iso) + 3) % 7) + 7) % 7;
}

export function addDays(iso, n) {
  return fromDayNum(toDayNum(iso) + n);
}

export function mondayOf(iso) {
  return addDays(iso, -weekday(iso));
}

export function isoFromDate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function dateFromIso(iso, minutes = 0) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, Math.floor(minutes / 60), minutes % 60);
}

export function toMinutes(hhmm) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function fromMinutes(min) {
  const p = (n) => String(n).padStart(2, '0');
  return `${p(Math.floor(min / 60))}:${p(min % 60)}`;
}

// ISO-8601 week number, shown the way a planner would ("Week 39").
export function isoWeekNumber(iso) {
  const thursday = addDays(mondayOf(iso), 3);
  const jan1 = `${thursday.slice(0, 4)}-01-01`;
  return Math.floor((toDayNum(thursday) - toDayNum(jan1)) / 7) + 1;
}

/**
 * An item's repeat rule:
 *   mode:  'once'     – only the week of startWeek
 *          'weekly'   – every week
 *          'interval' – every `every` weeks
 *   end:   'count'    – stop after `count` occurrences of the rule (weeks)
 *          'until'    – stop after the date `until`
 *          'never'
 *   startWeek: any date inside the first week
 * Items also carry `days` (weekday indexes) and `skip` (dates removed
 * individually, e.g. "cancel just this Tuesday").
 */
export function occursOn(item, iso) {
  if (!item.days || !item.days.includes(weekday(iso))) return false;
  if (item.skip && item.skip.includes(iso)) return false;
  const r = item.repeat || { mode: 'weekly', end: 'never' };
  const diffDays = toDayNum(mondayOf(iso)) - toDayNum(mondayOf(r.startWeek));
  if (diffDays < 0) return false;
  const weeks = diffDays / 7;
  if (r.mode === 'once') return weeks === 0;
  const every = r.mode === 'interval' ? Math.max(1, r.every | 0) : 1;
  if (weeks % every !== 0) return false;
  const index = weeks / every;
  if (r.end === 'count') return index < Math.max(1, r.count | 0);
  if (r.end === 'until') return !r.until || iso <= r.until;
  return true;
}

// Every {item, date} pair between two dates, inclusive, sorted by date then time.
export function occurrencesInRange(items, startIso, endIso) {
  const out = [];
  for (let n = toDayNum(startIso), last = toDayNum(endIso); n <= last; n++) {
    const iso = fromDayNum(n);
    for (const item of items) if (occursOn(item, iso)) out.push({ item, date: iso });
  }
  return out.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (toMinutes(a.item.start) ?? -1) - (toMinutes(b.item.start) ?? -1) ||
      a.item.title.localeCompare(b.item.title)
  );
}

// The last date a rule can produce, or null when it never ends.
export function lastWeekOf(repeat) {
  if (repeat.mode === 'once') return mondayOf(repeat.startWeek);
  if (repeat.end === 'count') {
    const every = repeat.mode === 'interval' ? Math.max(1, repeat.every | 0) : 1;
    return addDays(mondayOf(repeat.startWeek), 7 * every * (Math.max(1, repeat.count | 0) - 1));
  }
  if (repeat.end === 'until' && repeat.until) return mondayOf(repeat.until);
  return null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function shortDate(iso) {
  const [, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

export function monthName(iso, long = false) {
  const m = Number(iso.slice(5, 7)) - 1;
  const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];
  return long ? names[m] : MONTHS[m];
}

export function describeDays(days) {
  const sorted = [...days].sort((a, b) => a - b);
  const key = sorted.join('');
  if (key === '0123456') return 'Every day';
  if (key === '01234') return 'Weekdays';
  if (key === '56') return 'Weekends';
  return sorted.map((d) => WEEKDAYS[d]).join(', ');
}

// "Every 2 weeks · Tue, Thu · 8 times from Sep 21"
export function describeRepeat(item) {
  const r = item.repeat;
  const days = describeDays(item.days);
  const from = shortDate(mondayOf(r.startWeek));
  if (r.mode === 'once') return `${days} · week of ${from} only`;
  const freq = r.mode === 'interval' && r.every > 1 ? `Every ${r.every} weeks` : 'Every week';
  let span = `from ${from}, ongoing`;
  if (r.end === 'count') span = `${r.count} ${r.count == 1 ? 'time' : 'times'} from ${from}`;
  if (r.end === 'until' && r.until) span = `${from} – ${shortDate(r.until)}`;
  return `${freq} · ${days} · ${span}`;
}

/**
 * Side-by-side placement for overlapping timed blocks, like columns in a
 * calendar. Input: [{startMin, endMin, ...}]. Adds `lane` and `lanes`.
 */
export function layoutLanes(blocks) {
  const sorted = [...blocks].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
  let cluster = [];
  let clusterEnd = -1;
  const flush = () => {
    const lanes = cluster.reduce((m, b) => Math.max(m, b.lane + 1), 0);
    cluster.forEach((b) => (b.lanes = lanes));
    cluster = [];
  };
  for (const b of sorted) {
    if (b.startMin >= clusterEnd && cluster.length) flush();
    const laneEnds = [];
    for (const c of cluster) laneEnds[c.lane] = Math.max(laneEnds[c.lane] ?? -1, c.endMin);
    let lane = 0;
    while (laneEnds[lane] !== undefined && laneEnds[lane] > b.startMin) lane++;
    b.lane = lane;
    cluster.push(b);
    clusterEnd = Math.max(clusterEnd, b.endMin);
  }
  if (cluster.length) flush();
  return sorted;
}
