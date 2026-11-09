import {
  WEEKDAYS, addDays, mondayOf, weekday, isoFromDate, toMinutes, fromMinutes, isoWeekNumber,
  occursOn, occurrencesInRange, lastWeekOf, shortDate, monthName, describeRepeat, layoutLanes,
} from './recurrence.js';
import {
  COLORS, STATUSES, STATUS_LABEL, load, save, normalize, emptyState, sampleState, uid, statusKey,
} from './store.js';
import {
  dueReminders, upcomingReminders, pruneNotified, notificationsSupported, requestPermission,
  showSystemNotification,
} from './reminders.js';
import {
  isNative, platform, initNative, syncReminders, nativePermission, askNativePermission, exactAlarmSetting,
  openExactAlarmSetting, sendTestNotification, shareExport,
} from './native.js';

/* ---------- state ---------- */

const saved = load();
let state = saved || sampleState();
if (!saved && window.matchMedia('(max-width: 640px)').matches) state.settings.view = 'day';

const ui = {
  cursor: isoFromDate(new Date()),
  tab: 'home',
  sel: null, // {kind:'cell', date, min|null} | {kind:'item', id, date}
  undo: [],
  scrollPending: true,
  perm: 'prompt', // notification permission: granted | denied | prompt | unsupported
  exact: 'granted', // Android exact-alarm setting
};

const $ = (s, el = document) => el.querySelector(s);
const S = () => state.settings;
const today = () => isoFromDate(new Date());
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const itemById = (id) => state.items.find((i) => i.id === id);
const statusOf = (id, date) => state.status[statusKey(id, date)] || 'todo';
const LETTERS = 'ABCDEFG';
const NEXT_STATUS = { todo: 'doing', doing: 'done', done: 'todo' };

function persist() {
  const ok = save(state);
  const el = $('#saveState');
  if (el) el.textContent = ok ? 'Saved on this device' : 'Not saved — browser storage is off';
  syncReminders(state);
}

async function refreshPermission() {
  if (isNative) {
    ui.perm = await nativePermission();
    ui.exact = await exactAlarmSetting();
  } else if (notificationsSupported()) {
    ui.perm = Notification.permission === 'default' ? 'prompt' : Notification.permission;
  } else ui.perm = 'unsupported';
  if (ui.tab === 'reminders') renderRibbon();
  return ui.perm;
}

async function askPermission() {
  if (isNative) await askNativePermission();
  else await requestPermission();
  const p = await refreshPermission();
  syncReminders(state);
  return p;
}

function commit(mutate, { undoable = true } = {}) {
  if (undoable) {
    ui.undo.push(JSON.stringify({ items: state.items, status: state.status }));
    if (ui.undo.length > 50) ui.undo.shift();
  }
  mutate();
  persist();
  render();
}

function undo() {
  const snap = ui.undo.pop();
  if (!snap) return toast('Nothing to undo');
  const prev = JSON.parse(snap);
  state.items = prev.items;
  state.status = prev.status;
  if (ui.sel?.kind === 'item' && !itemById(ui.sel.id)) ui.sel = null;
  persist();
  render();
  toast('Undone');
}

/* ---------- formatting ---------- */

function fmtTime(min, compact = false) {
  if (min == null) return '';
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  if (S().clock24) return fromMinutes(h * 60 + m);
  const h12 = h % 12 || 12;
  const ap = h < 12 ? (compact ? 'a' : ' AM') : compact ? 'p' : ' PM';
  return compact && m === 0 ? `${h12}${ap}` : `${h12}:${String(m).padStart(2, '0')}${ap}`;
}

function fmtHour(h) {
  if (S().clock24) return `${String(h).padStart(2, '0')}:00`;
  return `${h % 12 || 12} ${h < 12 || h === 24 ? 'AM' : 'PM'}`;
}

function timeRange(item) {
  if (item.allDay || !item.start) return 'All day';
  const s = toMinutes(item.start);
  if (item.kind === 'task' || !item.end) return `Due ${fmtTime(s)}`;
  return `${fmtTime(s)} – ${fmtTime(toMinutes(item.end))}`;
}

const longDay = (iso) =>
  ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][weekday(iso)];
const dayLabel = (iso) => `${WEEKDAYS[weekday(iso)]}, ${shortDate(iso)}`;

/* ---------- ranges ---------- */

function visibleDays() {
  const view = S().view;
  if (view === 'day') return [ui.cursor];
  if (view === 'week') {
    const mon = mondayOf(ui.cursor);
    return Array.from({ length: S().weekends ? 7 : 5 }, (_, i) => addDays(mon, i));
  }
  // month: whole weeks covering the month
  const first = `${ui.cursor.slice(0, 8)}01`;
  const start = mondayOf(first);
  const days = [];
  for (let i = 0; i < 42; i++) {
    const d = addDays(start, i);
    if (i % 7 === 0 && i >= 28 && d.slice(0, 7) !== first.slice(0, 7)) break;
    if (!S().weekends && weekday(d) > 4) continue;
    days.push(d);
  }
  return days;
}

function statDays() {
  const days = visibleDays();
  return S().view === 'month' ? days.filter((d) => d.slice(0, 7) === ui.cursor.slice(0, 7)) : days;
}

function occurrencesFor(date) {
  return state.items
    .filter((i) => occursOn(i, date))
    .filter((i) => !(S().hideDone && statusOf(i.id, date) === 'done'))
    .sort((a, b) => (toMinutes(a.start) ?? -1) - (toMinutes(b.start) ?? -1) || a.title.localeCompare(b.title));
}

function cellRef(date, min) {
  const days = visibleDays();
  const idx = days.indexOf(date);
  if (S().view === 'month') {
    const cols = S().weekends ? 7 : 5;
    return idx < 0 ? '' : `${LETTERS[idx % cols]}${Math.floor(idx / cols) + 1}`;
  }
  const col = LETTERS[Math.max(0, idx)] || 'A';
  return min == null ? `${col}0` : `${col}${Math.floor(min / 60)}`;
}

/* ---------- icons ---------- */

const ICONS = {
  event: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M12 12.5v5M9.5 15h5',
  task: 'M4 4h16v16H4zM8 12l3 3 5-6',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3',
  today: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M10 13h4v4h-4z',
  prev: 'M15 5l-7 7 7 7',
  next: 'M9 5l7 7-7 7',
  day: 'M7 4h10v16H7zM7 9h10',
  week: 'M3 5h18v14H3zM3 9h18M7.5 9v10M12 9v10M16.5 9v10',
  month: 'M3 5h18v15H3zM3 10h18M3 15h18M9 10v10M15 10v10',
  bell: 'M6 16v-5a6 6 0 0112 0v5l2 2H4zM10 21a2 2 0 004 0',
  send: 'M4 12l16-8-6 16-3-7z',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  upload: 'M12 20V9M7 14l5-5 5 5M5 4h14',
  copy: 'M8 8h12v12H8zM4 16V4h12',
  sample: 'M5 4h14v16H5zM9 8h6M9 12h6M9 16h3',
  clear: 'M6 6l12 12M18 6L6 18',
};
const icon = (n) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${ICONS[n]}"/></svg>`;

const glyph = (item, date) => {
  const st = statusOf(item.id, date);
  return `<button type="button" class="st st-${st} ${item.kind === 'task' ? 'is-task' : ''}" data-act="cycle"
    data-id="${item.id}" data-date="${date}" title="${STATUS_LABEL[st]} — click to change"
    aria-label="${esc(item.title)}: ${STATUS_LABEL[st]}. Change status">${st === 'done'
      ? '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.2l2.3 2.3 4.7-5"/></svg>' : ''}</button>`;
};

/* ---------- ribbon ---------- */

const rbtn = (act, ic, label, { big = false, disabled = false, pressed = null, extra = '' } = {}) =>
  `<button type="button" class="rbtn${big ? ' big' : ''}" data-act="${act}" ${extra}
    ${disabled ? 'disabled' : ''} ${pressed === null ? '' : `aria-pressed="${pressed}"`}>${icon(ic)}<span>${label}</span></button>`;
const group = (label, body) =>
  `<div class="rgroup"><div class="rgroup-body">${body}</div><div class="rgroup-label">${label}</div></div>`;

function renderRibbon() {
  const selItem = ui.sel?.kind === 'item' ? itemById(ui.sel.id) : null;
  const st = selItem ? statusOf(selItem.id, ui.sel.date) : null;
  let html = '';
  if (ui.tab === 'home') {
    html += group('Add', rbtn('new-event', 'event', 'New event', { big: true }) + rbtn('new-task', 'task', 'New task', { big: true }));
    html += group(
      'Status',
      `<div class="stack">${STATUSES.map(
        (s) => `<button type="button" class="rbtn status-btn" data-act="set-status" data-status="${s}"
          ${selItem ? '' : 'disabled'} aria-pressed="${st === s}"><span class="st st-${s}${selItem?.kind === 'task' ? ' is-task' : ''}" aria-hidden="true">${
          s === 'done' ? '<svg viewBox="0 0 12 12"><path d="M2.5 6.2l2.3 2.3 4.7-5"/></svg>' : ''}</span><span>${STATUS_LABEL[s]}</span></button>`
      ).join('')}</div>`
    );
    html += group(
      'Item',
      `<div class="stack">${rbtn('edit', 'edit', 'Edit', { disabled: !selItem })}${rbtn('delete', 'trash', 'Delete', { disabled: !selItem })}${rbtn('undo', 'undo', 'Undo', { disabled: !ui.undo.length })}</div>`
    );
    html += group(
      'Go to',
      `${rbtn('today', 'today', 'Today', { big: true })}<div class="stack">${rbtn('prev', 'prev', 'Previous')}${rbtn('next', 'next', 'Next')}
        <label class="rfield"><span class="sr">Jump to date</span><input type="date" id="jump" value="${ui.cursor}"></label></div>`
    );
  } else if (ui.tab === 'view') {
    const v = S().view;
    html += group('Layout', ['day', 'week', 'month'].map((k) =>
      rbtn(`view-${k}`, k, k[0].toUpperCase() + k.slice(1), { big: true, pressed: v === k })).join(''));
    const hourOpts = (sel, from, to) =>
      Array.from({ length: to - from + 1 }, (_, i) => from + i)
        .map((h) => `<option value="${h}" ${h === sel ? 'selected' : ''}>${fmtHour(h)}</option>`).join('');
    html += group('Hours', `<div class="stack">
      <label class="rfield" for="dayStart"><span>From</span><select id="dayStart">${hourOpts(S().dayStart, 0, 12)}</select></label>
      <label class="rfield" for="dayEnd"><span>To</span><select id="dayEnd">${hourOpts(S().dayEnd, 13, 24)}</select></label></div>`);
    const check = (id, label, on) =>
      `<label class="rcheck" for="${id}"><input type="checkbox" id="${id}" ${on ? 'checked' : ''}><span>${label}</span></label>`;
    html += group('Show', `<div class="stack">${check('opt-weekends', 'Weekends', S().weekends)}${check('opt-clock24', '24-hour clock', S().clock24)}${check('opt-hideDone', 'Hide done items', S().hideDone)}</div>`);
  } else if (ui.tab === 'reminders') {
    const perm = ui.perm;
    const permText = isNative
      ? {
          granted: 'Reminders are scheduled with your phone, so they arrive even when Ultra Planner is closed.',
          denied: `Notifications are turned off for Ultra Planner. Turn them on in your phone’s Settings › ${platform === 'ios' ? 'Notifications › Ultra Planner' : 'Apps › Ultra Planner › Notifications'}.`,
          prompt: 'Allow notifications so reminders arrive even when Ultra Planner is closed.',
        }[perm]
      : {
          granted: 'System notifications are on.',
          denied: 'Notifications are blocked for this site — reminders appear inside the app instead. Allow them in your browser’s site settings.',
          prompt: 'Reminders appear inside the app. Allow notifications to get them even when this tab is in the background.',
          unsupported: 'This browser can’t show system notifications here, so reminders appear inside the app.',
        }[perm];
    const exactNote = isNative && perm === 'granted' && ui.exact !== 'granted'
      ? ' Android may delay them by a few minutes — turn on exact timing to get them right on time.' : '';
    html += group('Reminders', `${rbtn('toggle-reminders', 'bell', S().reminders ? 'On' : 'Off', { big: true, pressed: S().reminders })}
      <div class="stack">${rbtn('allow-notify', 'bell', 'Allow notifications', { disabled: perm !== 'prompt' })}${
        exactNote ? rbtn('exact-alarm', 'today', 'Exact timing') : ''}${rbtn('test-notify', 'send', 'Send a test')}</div>`);
    const leads = [[0, 'At start'], [5, '5 min before'], [10, '10 min before'], [15, '15 min before'], [30, '30 min before'], [60, '1 hour before']];
    html += group('Defaults', `<div class="stack">
      <label class="rfield" for="defaultLead"><span>New items</span><select id="defaultLead"><option value="">No reminder</option>${leads.map(
        ([v, l]) => `<option value="${v}" ${S().defaultLead === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="rfield" for="allDayAt"><span>All-day at</span><input type="time" id="allDayAt" value="${S().allDayReminderAt}"></label></div>`);
    const up = upcomingReminders(state);
    html += group('Coming up', `<div class="upcoming"><p class="note">${permText}${exactNote}</p>${up.length
      ? `<ul>${up.map((r) => `<li><span class="mono">${r.date === today() ? 'Today' : WEEKDAYS[weekday(r.date)]} ${fmtTime(r.at.getHours() * 60 + r.at.getMinutes())}</span> ${esc(r.item.title)}</li>`).join('')}</ul>`
      : '<p class="note">No reminders in the next 7 days.</p>'}</div>`);
  } else if (ui.tab === 'file') {
    html += group('Your data', `${rbtn('export', 'download', 'Export', { big: true })}<div class="stack">${rbtn('import', 'upload', 'Import…')}${rbtn('copy-data', 'copy', 'Copy as text')}</div>
      <input type="file" id="importFile" accept="application/json,.json" hidden>`);
    html += group('Start over', `<div class="stack">${rbtn('load-sample', 'sample', 'Load sample routine')}${rbtn('clear-all', 'clear', 'Clear everything')}</div>`);
    html += group('About', `<p class="note about"><strong>Ultra Planner</strong> — one-time purchase, no subscription, no account. Your routine is stored only on this device; export it to back it up or move it.</p>`);
  }
  $('#ribbon').innerHTML = html;
  document.querySelectorAll('.rtab').forEach((t) => {
    const on = t.dataset.tab === ui.tab;
    t.setAttribute('aria-selected', on);
    t.tabIndex = on ? 0 : -1;
  });
}

/* ---------- formula bar ---------- */

function renderFormula() {
  const box = $('#nameBox');
  const fx = $('#fx');
  const sel = ui.sel;
  let ref = '';
  let place = 'Select a cell, then type to add something there';
  let value = '';
  if (sel?.kind === 'item') {
    const item = itemById(sel.id);
    ref = `${cellRef(sel.date, item.allDay ? null : toMinutes(item.start))}`;
    value = item.title;
    place = 'Title';
    $('#fxHint').textContent = `${timeRange(item)} · ${describeRepeat(item)}`;
  } else if (sel?.kind === 'cell') {
    ref = cellRef(sel.date, sel.min);
    const when = sel.min == null ? `every ${longDay(sel.date)}` : `${WEEKDAYS[weekday(sel.date)]} ${fmtTime(sel.min)}`;
    place = sel.min == null
      ? `Type a title and press Enter to add a task ${when}`
      : `Type a title and press Enter to add a weekly event at ${when} — start with “task:” for a task`;
    $('#fxHint').textContent = sel.min == null ? dayLabel(sel.date) : `${dayLabel(sel.date)} · ${fmtTime(sel.min)}`;
  } else {
    $('#fxHint').textContent = '';
  }
  box.textContent = ref || '—';
  fx.placeholder = place;
  fx.disabled = !sel;
  if (document.activeElement !== fx) fx.value = value;
}

function quickAdd(text) {
  const sel = ui.sel;
  if (!sel || sel.kind !== 'cell') return;
  let title = text.trim();
  if (!title) return;
  let kind = sel.min == null ? 'task' : 'event';
  const m = title.match(/^(task|event)\s*:\s*/i);
  if (m) {
    kind = m[1].toLowerCase();
    title = title.slice(m[0].length).trim() || (kind === 'task' ? 'New task' : 'New event');
  }
  const start = sel.min == null ? null : fromMinutes(sel.min);
  const item = {
    id: uid(), kind, title, days: [weekday(sel.date)], allDay: sel.min == null,
    start, end: kind === 'event' && start ? fromMinutes(Math.min(sel.min + 60, 24 * 60 - 1)) : null,
    color: kind === 'task' ? 'red' : 'blue', notes: '', skip: [],
    reminder: S().defaultLead === '' ? null : S().defaultLead,
    repeat: { mode: 'weekly', end: 'never', startWeek: mondayOf(sel.date) },
  };
  commit(() => {
    state.items.push(item);
    ui.sel = { kind: 'item', id: item.id, date: sel.date };
  });
  toast(`Added “${title}” every ${longDay(sel.date)}${start ? ` at ${fmtTime(sel.min)}` : ''}`, {
    actions: [{ label: 'Change repeat', fn: () => openEditor({ id: item.id, date: sel.date }) }],
  });
}

/* ---------- sheet ---------- */

function renderSheet() {
  const view = S().view;
  const sheet = $('#sheet');
  const days = visibleDays();
  sheet.dataset.view = view;
  sheet.innerHTML = view === 'month' ? renderMonth(days) : renderTimed(days, view);
  if (ui.scrollPending && view !== 'month') {
    const hourPx = view === 'day' ? 64 : 52;
    const start = Number(sheet.querySelector('.grid').dataset.start);
    const now = new Date();
    const target = days.includes(today()) ? Math.max(start, now.getHours() - 1) : Math.max(start, 8);
    sheet.scrollTop = (target - start) * hourPx;
  }
  ui.scrollPending = false;
}

function renderTimed(days, view) {
  const hourPx = view === 'day' ? 64 : 52;
  const occ = new Map(days.map((d) => [d, occurrencesFor(d)]));
  let minS = S().dayStart * 60;
  let maxE = S().dayEnd * 60;
  for (const list of occ.values())
    for (const i of list) {
      if (i.allDay || !i.start) continue;
      const s = toMinutes(i.start);
      minS = Math.min(minS, s);
      maxE = Math.max(maxE, i.kind === 'task' || !i.end ? s + 30 : toMinutes(i.end));
    }
  const start = Math.floor(minS / 60);
  const end = Math.min(24, Math.ceil(maxE / 60));
  const hours = end - start;
  const t = today();
  const selDate = ui.sel?.date;

  let html = `<div class="grid timed" data-start="${start}" style="--cols:${days.length};--hour:${hourPx}px;--hours:${hours}">`;
  html += `<div class="corner" aria-hidden="true"></div>`;
  days.forEach((d, i) => {
    html += `<div class="colhead${d === t ? ' is-today' : ''}${d === selDate ? ' is-active' : ''}">
      <span class="col-letter">${LETTERS[i]}</span>
      <button type="button" class="col-day" data-act="goto-day" data-date="${d}" title="Open ${longDay(d)}">
        <span>${view === 'day' ? longDay(d) : WEEKDAYS[weekday(d)]}</span><b>${Number(d.slice(8))}</b></button></div>`;
  });
  html += `<div class="rowhead allday-head${ui.sel?.kind === 'cell' && ui.sel.min == null ? ' is-active' : ''}">All day</div>`;
  days.forEach((d) => {
    const chips = occ.get(d).filter((i) => i.allDay || !i.start).map((i) => chip(i, d, true)).join('');
    const selCell = ui.sel?.kind === 'cell' && ui.sel.date === d && ui.sel.min == null;
    html += `<div class="allday-cell${selCell ? ' is-sel' : ''}" data-cell="allday" data-date="${d}">${chips}</div>`;
  });
  html += `<div class="gutter">${Array.from({ length: hours }, (_, h) => {
    const hr = start + h;
    const active = ui.sel?.kind === 'cell' && ui.sel.min != null && Math.floor(ui.sel.min / 60) === hr;
    return `<div class="rowhead hour${active ? ' is-active' : ''}"><span>${fmtHour(hr)}</span></div>`;
  }).join('')}</div>`;

  days.forEach((d) => {
    const blocks = occ.get(d)
      .filter((i) => !i.allDay && i.start)
      .map((i) => {
        const s = toMinutes(i.start);
        const e = i.kind === 'task' || !i.end ? s + 30 : Math.max(toMinutes(i.end), s + 20);
        return { item: i, startMin: s, endMin: e };
      });
    layoutLanes(blocks);
    let col = `<div class="daycol${d === t ? ' is-today' : ''}" data-cell="time" data-date="${d}">`;
    for (const b of blocks) col += block(b, d, start, hourPx, view);
    if (ui.sel?.kind === 'cell' && ui.sel.date === d && ui.sel.min != null) {
      col += `<div class="selbox" style="top:${((ui.sel.min - start * 60) / 60) * hourPx}px;height:${hourPx / 2}px"></div>`;
    }
    if (d === t) col += `<div class="nowline" data-start="${start}" data-hour="${hourPx}"></div>`;
    html += col + '</div>';
  });
  return html + '</div>';
}

function block(b, date, startHour, hourPx, view) {
  const { item } = b;
  const st = statusOf(item.id, date);
  const top = ((b.startMin - startHour * 60) / 60) * hourPx;
  const height = Math.max(((b.endMin - b.startMin) / 60) * hourPx - 2, 20);
  const sel = ui.sel?.kind === 'item' && ui.sel.id === item.id && ui.sel.date === date;
  const tall = height >= 44;
  const meta = [timeRange(item)];
  if (view === 'day') {
    if (item.notes) meta.push(esc(item.notes));
    meta.push(esc(describeRepeat(item)));
  } else if (item.notes && height >= 70) meta.push(esc(item.notes));
  return `<div class="blk kind-${item.kind} st-${st}${sel ? ' is-sel' : ''}${tall ? ' is-tall' : ''}"
    style="--c:${COLORS[item.color] || COLORS.blue};top:${top}px;height:${height}px;--lane:${b.lane};--lanes:${b.lanes}"
    data-id="${item.id}" data-date="${date}" title="${esc(item.title)} · ${esc(timeRange(item))}">
    ${glyph(item, date)}<div class="blk-body"><div class="blk-title">${esc(item.title)}</div>
    <div class="blk-meta">${meta.join(' · ')}</div></div></div>`;
}

function chip(item, date, full = false) {
  const st = statusOf(item.id, date);
  const sel = ui.sel?.kind === 'item' && ui.sel.id === item.id && ui.sel.date === date;
  const time = item.allDay || !item.start ? '' : `<span class="chip-time">${fmtTime(toMinutes(item.start), true)}</span>`;
  return `<div class="chip kind-${item.kind} st-${st}${sel ? ' is-sel' : ''}${full ? ' is-full' : ''}"
    style="--c:${COLORS[item.color] || COLORS.blue}" data-id="${item.id}" data-date="${date}"
    title="${esc(item.title)} · ${esc(timeRange(item))}">${glyph(item, date)}${time}<span class="chip-title">${esc(item.title)}</span></div>`;
}

function renderMonth(days) {
  const cols = S().weekends ? 7 : 5;
  const month = ui.cursor.slice(0, 7);
  const t = today();
  const MAX = 3;
  let html = `<div class="grid month" style="--cols:${cols}"><div class="corner" aria-hidden="true"></div>`;
  for (let c = 0; c < cols; c++)
    html += `<div class="colhead"><span class="col-letter">${LETTERS[c]}</span><span class="col-day"><span>${WEEKDAYS[c]}</span></span></div>`;
  for (let r = 0; r < days.length / cols; r++) {
    const wk = days[r * cols];
    const activeRow = ui.sel && days.indexOf(ui.sel.date) >= r * cols && days.indexOf(ui.sel.date) < (r + 1) * cols;
    html += `<div class="rowhead week-head${activeRow ? ' is-active' : ''}" title="Week ${isoWeekNumber(wk)}"><span>${r + 1}</span><small>W${isoWeekNumber(wk)}</small></div>`;
    for (let c = 0; c < cols; c++) {
      const d = days[r * cols + c];
      const list = occurrencesFor(d);
      const sel = ui.sel?.kind === 'cell' && ui.sel.date === d;
      html += `<div class="mcell${d.slice(0, 7) !== month ? ' is-out' : ''}${d === t ? ' is-today' : ''}${sel ? ' is-sel' : ''}" data-cell="month" data-date="${d}">
        <button type="button" class="mnum" data-act="goto-day" data-date="${d}" title="Open ${longDay(d)}, ${shortDate(d)}">${Number(d.slice(8)) === 1 ? `${monthName(d)} 1` : Number(d.slice(8))}</button>
        <div class="mlist">${list.slice(0, MAX).map((i) => chip(i, d)).join('')}
        ${list.length > MAX ? `<button type="button" class="more" data-act="goto-day" data-date="${d}">+${list.length - MAX} more</button>` : ''}</div></div>`;
    }
  }
  return html + '</div>';
}

function updateNowLine() {
  const line = $('.nowline');
  if (!line) return;
  const now = new Date();
  const min = now.getHours() * 60 + now.getMinutes();
  line.style.top = `${((min - Number(line.dataset.start) * 60) / 60) * Number(line.dataset.hour)}px`;
}

/* ---------- title + status bar ---------- */

function renderChrome() {
  const view = S().view;
  const days = visibleDays();
  let label;
  if (view === 'day') label = `${longDay(ui.cursor)}, ${shortDate(ui.cursor)}, ${ui.cursor.slice(0, 4)}`;
  else if (view === 'week') {
    const a = days[0];
    const b = days[days.length - 1];
    label = a.slice(5, 7) === b.slice(5, 7)
      ? `${shortDate(a)} – ${Number(b.slice(8))}, ${b.slice(0, 4)}`
      : `${shortDate(a)} – ${shortDate(b)}, ${b.slice(0, 4)}`;
  } else label = `${monthName(ui.cursor, true)} ${ui.cursor.slice(0, 4)}`;
  $('#rangeLabel').textContent = label;
  $('#weekLabel').textContent = view === 'month' ? '' : `Week ${isoWeekNumber(ui.cursor)}`;

  document.querySelectorAll('.sheettab').forEach((t) => t.setAttribute('aria-selected', t.dataset.view === view));

  const range = statDays();
  const occ = occurrencesInRange(state.items, range[0], range[range.length - 1]).filter(
    (o) => S().weekends || weekday(o.date) < 5
  );
  const counts = { todo: 0, doing: 0, done: 0 };
  occ.forEach((o) => counts[statusOf(o.item.id, o.date)]++);
  const pct = occ.length ? Math.round((counts.done / occ.length) * 100) : 0;
  $('#stats').innerHTML = `
    <span>Count <b>${occ.length}</b></span>
    <span class="s-todo">Not started <b>${counts.todo}</b></span>
    <span class="s-doing">Working <b>${counts.doing}</b></span>
    <span class="s-done">Done <b>${counts.done}</b></span>
    <span class="meter" title="${pct}% done"><i style="width:${pct}%"></i></span><span><b>${pct}%</b></span>`;
  const sel = ui.sel?.kind === 'item' ? itemById(ui.sel.id) : null;
  $('#readyText').textContent = sel ? `${STATUS_LABEL[statusOf(sel.id, ui.sel.date)]} · ${dayLabel(ui.sel.date)}` : 'Ready';
  $('#sampleBar').hidden = !state.sample;
}

function render() {
  renderRibbon();
  renderFormula();
  renderSheet();
  renderChrome();
  updateNowLine();
}

/* ---------- navigation ---------- */

function step(dir) {
  const v = S().view;
  if (v === 'day') ui.cursor = addDays(ui.cursor, dir);
  else if (v === 'week') ui.cursor = addDays(ui.cursor, 7 * dir);
  else {
    let [y, m] = ui.cursor.split('-').map(Number);
    m += dir;
    if (m < 1) { m = 12; y--; }
    if (m > 12) { m = 1; y++; }
    ui.cursor = `${y}-${String(m).padStart(2, '0')}-01`;
  }
  ui.scrollPending = true;
  render();
}

function setView(v) {
  S().view = v;
  ui.scrollPending = true;
  persist();
  render();
}

function gotoDay(date) {
  ui.cursor = date;
  ui.sel = { kind: 'cell', date, min: null };
  setView('day');
}

/* ---------- status + delete ---------- */

function setStatus(id, date, st) {
  commit(() => {
    const key = statusKey(id, date);
    if (st === 'todo') delete state.status[key];
    else state.status[key] = st;
  });
}

async function deleteSelected(id = ui.sel?.id, date = ui.sel?.date) {
  const item = itemById(id);
  if (!item) return;
  const single = item.repeat.mode === 'once' && item.days.length === 1;
  const choice = await ask({
    title: `Delete “${item.title}”?`,
    body: single ? 'This removes it from your routine.' : `It repeats: ${describeRepeat(item)}.`,
    buttons: single
      ? [{ label: 'Cancel', value: null }, { label: 'Delete', value: 'all', tone: 'danger' }]
      : [
          { label: 'Cancel', value: null },
          { label: `Only ${dayLabel(date)}`, value: 'one' },
          { label: 'Every week', value: 'all', tone: 'danger' },
        ],
  });
  if (!choice) return;
  commit(() => {
    if (choice === 'one') {
      item.skip = [...(item.skip || []), date];
      delete state.status[statusKey(item.id, date)];
    } else {
      state.items = state.items.filter((i) => i.id !== item.id);
    }
    ui.sel = null;
  });
  toast(choice === 'one' ? `Removed ${dayLabel(date)} only` : `Deleted “${item.title}”`, {
    actions: [{ label: 'Undo', fn: undo }],
  });
}

/* ---------- dialogs ---------- */

function ask({ title, body, buttons }) {
  const dlg = $('#ask');
  dlg.innerHTML = `<form method="dialog" class="ask">
    <h2>${esc(title)}</h2><p>${esc(body)}</p>
    <div class="ask-actions">${buttons.map((b, i) =>
      `<button type="button" class="btn${b.tone === 'danger' ? ' danger' : ''}${i === buttons.length - 1 ? ' primary' : ''}" data-i="${i}">${esc(b.label)}</button>`).join('')}</div></form>`;
  return new Promise((resolve) => {
    let result = null;
    dlg.querySelectorAll('button').forEach((b) =>
      b.addEventListener('click', () => {
        result = buttons[Number(b.dataset.i)].value;
        dlg.close();
      })
    );
    dlg.addEventListener('close', () => resolve(result), { once: true });
    dlg.showModal();
  });
}

const REMINDER_OPTS = [[null, 'No reminder'], [0, 'At start time'], [5, '5 minutes before'], [10, '10 minutes before'],
  [15, '15 minutes before'], [30, '30 minutes before'], [60, '1 hour before'], [1440, '1 day before']];

function openEditor({ id = null, date = ui.cursor, kind = 'event', min = null } = {}) {
  const existing = id ? itemById(id) : null;
  const d = existing || {
    kind, title: '', days: [weekday(date)], allDay: kind === 'task' && min == null,
    start: min != null ? fromMinutes(min) : kind === 'event' ? '09:00' : '17:00',
    end: min != null ? fromMinutes(Math.min(min + 60, 1439)) : '10:00',
    color: kind === 'task' ? 'red' : 'blue', notes: '',
    reminder: S().defaultLead === '' ? null : S().defaultLead,
    repeat: { mode: 'weekly', end: 'never', every: 2, count: 12, until: '', startWeek: mondayOf(date) },
  };
  const r = { every: 2, count: 12, until: addDays(mondayOf(date), 7 * 14 + 4), ...d.repeat };
  const dlg = $('#editor');
  dlg.innerHTML = `<form class="editor" id="editorForm" novalidate>
    <header class="ed-head">
      <h2>${existing ? 'Edit' : 'New'} <span id="ed-kind-word">${d.kind === 'task' ? 'task' : 'event'}</span></h2>
      <div class="seg" role="radiogroup" aria-label="Type">
        <input type="radio" name="kind" id="f-kind-event" value="event" ${d.kind === 'event' ? 'checked' : ''}><label for="f-kind-event">Event</label>
        <input type="radio" name="kind" id="f-kind-task" value="task" ${d.kind === 'task' ? 'checked' : ''}><label for="f-kind-task">Task</label>
      </div>
    </header>
    <div class="ed-body">
      <label class="field" for="f-title"><span>Title</span>
        <input id="f-title" required maxlength="120" value="${esc(d.title)}" placeholder="e.g. Biology lecture" autocomplete="off"></label>

      <fieldset class="field"><legend>Days</legend>
        <div class="days">${WEEKDAYS.map((w, i) =>
          `<input type="checkbox" id="f-day-${i}" value="${i}" ${d.days.includes(i) ? 'checked' : ''}><label for="f-day-${i}" title="${w}">${w.slice(0, 2)}</label>`).join('')}</div>
        <div class="presets"><button type="button" class="link" data-days="01234">Weekdays</button><button type="button" class="link" data-days="024">Mon · Wed · Fri</button><button type="button" class="link" data-days="13">Tue · Thu</button><button type="button" class="link" data-days="56">Weekend</button></div>
      </fieldset>

      <fieldset class="field"><legend>Time</legend>
        <div class="row">
          <label class="check" for="f-allday"><input type="checkbox" id="f-allday" ${d.allDay ? 'checked' : ''}><span>All day</span></label>
          <label class="inline time-field" for="f-start"><span id="f-start-label">${d.kind === 'task' ? 'Due' : 'Starts'}</span><input type="time" id="f-start" value="${d.start || '09:00'}"></label>
          <label class="inline time-field end-field" for="f-end"><span>Ends</span><input type="time" id="f-end" value="${d.end || '10:00'}"></label>
        </div>
      </fieldset>

      <fieldset class="field"><legend>Repeat</legend>
        <div class="row">
          <select id="f-mode" aria-label="How often">
            <option value="weekly" ${r.mode === 'weekly' ? 'selected' : ''}>Every week</option>
            <option value="interval" ${r.mode === 'interval' ? 'selected' : ''}>Every few weeks</option>
            <option value="once" ${r.mode === 'once' ? 'selected' : ''}>One week only</option>
          </select>
          <label class="inline" for="f-every" id="every-wrap"><span>every</span><input type="number" id="f-every" min="2" max="52" value="${Math.max(2, r.every || 2)}"><span>weeks</span></label>
        </div>
        <div class="row">
          <label class="inline" for="f-startweek"><span id="startweek-label">Starting week of</span><input type="date" id="f-startweek" value="${r.startWeek}"></label>
        </div>
        <div class="row" id="ends-wrap">
          <label class="inline" for="f-endmode"><span>Ends</span><select id="f-endmode">
            <option value="never" ${r.end === 'never' ? 'selected' : ''}>Never</option>
            <option value="count" ${r.end === 'count' ? 'selected' : ''}>After a number of weeks</option>
            <option value="until" ${r.end === 'until' ? 'selected' : ''}>On a date</option></select></label>
          <label class="inline" for="f-count" id="count-wrap"><input type="number" id="f-count" min="1" max="520" value="${r.count || 12}"><span id="count-unit">weeks</span></label>
          <label class="inline" for="f-until" id="until-wrap"><span class="sr">End date</span><input type="date" id="f-until" value="${r.until || ''}"></label>
        </div>
        <p class="preview" id="preview" aria-live="polite"></p>
      </fieldset>

      <div class="row two">
        <label class="field" for="f-reminder"><span>Reminder</span><select id="f-reminder">${REMINDER_OPTS.map(
          ([v, l]) => `<option value="${v ?? ''}" ${d.reminder === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <fieldset class="field"><legend>Color</legend><div class="swatches">${Object.entries(COLORS).map(
          ([k, v]) => `<input type="radio" name="color" id="f-color-${k}" value="${k}" ${d.color === k ? 'checked' : ''}><label for="f-color-${k}" style="--c:${v}" title="${k}"><span class="sr">${k}</span></label>`).join('')}</div></fieldset>
      </div>

      <label class="field" for="f-notes"><span>Notes</span><textarea id="f-notes" rows="2" placeholder="Room, link, what to bring…">${esc(d.notes)}</textarea></label>
      <p class="error" id="f-error" role="alert"></p>
    </div>
    <footer class="ed-foot">
      ${existing ? `<button type="button" class="btn danger ghost" id="ed-delete">${icon('trash')}Delete</button>` : ''}
      ${existing && existing.repeat.mode !== 'once' ? '<span class="note">Changes apply to every week of this routine.</span>' : ''}
      <span class="spacer"></span>
      <button type="button" class="btn" id="ed-cancel">Cancel</button>
      <button type="submit" class="btn primary">${existing ? 'Save' : 'Add to routine'}</button>
    </footer></form>`;

  const f = $('#editorForm');
  const val = (sel) => $(sel, f).value;
  const sync = () => {
    const k = f.querySelector('input[name="kind"]:checked').value;
    const allDay = $('#f-allday', f).checked;
    const mode = val('#f-mode');
    const endMode = val('#f-endmode');
    $('#ed-kind-word', f).textContent = k;
    $('#f-start-label', f).textContent = k === 'task' ? 'Due' : 'Starts';
    f.querySelectorAll('.time-field').forEach((el) => (el.hidden = allDay));
    $('.end-field', f).hidden = allDay || k === 'task';
    $('#every-wrap', f).hidden = mode !== 'interval';
    $('#ends-wrap', f).hidden = mode === 'once';
    $('#startweek-label', f).textContent = mode === 'once' ? 'Week of' : 'Starting week of';
    $('#count-wrap', f).hidden = endMode !== 'count';
    $('#until-wrap', f).hidden = endMode !== 'until';
    $('#count-unit', f).textContent = mode === 'interval' ? 'times' : 'weeks';
    const { item } = readForm(f, existing);
    $('#preview', f).innerHTML = previewText(item);
  };
  f.addEventListener('input', sync);
  f.addEventListener('change', sync);
  f.querySelectorAll('[data-days]').forEach((b) =>
    b.addEventListener('click', () => {
      const set = b.dataset.days.split('').map(Number);
      WEEKDAYS.forEach((_, i) => ($(`#f-day-${i}`, f).checked = set.includes(i)));
      sync();
    })
  );
  $('#ed-cancel', f).addEventListener('click', () => dlg.close());
  $('#ed-delete', f)?.addEventListener('click', () => {
    dlg.close();
    deleteSelected(existing.id, date);
  });
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const { item, error } = readForm(f, existing);
    if (error) {
      $('#f-error', f).textContent = error;
      return;
    }
    commit(() => {
      if (existing) Object.assign(existing, item);
      else state.items.push(item);
      const selDate = occursOn(item, date) ? date : firstOccurrence(item) || date;
      ui.sel = { kind: 'item', id: item.id, date: selDate };
    });
    dlg.close();
    toast(existing ? `Saved “${item.title}”` : `Added “${item.title}” — ${describeRepeat(item)}`);
  });
  sync();
  dlg.showModal();
  if (!existing) $('#f-title', f).focus();
}

function readForm(f, existing) {
  const val = (sel) => $(sel, f).value;
  const kind = f.querySelector('input[name="kind"]:checked').value;
  const days = WEEKDAYS.map((_, i) => i).filter((i) => $(`#f-day-${i}`, f).checked);
  const allDay = $('#f-allday', f).checked;
  const mode = val('#f-mode');
  const repeat = { mode, end: mode === 'once' ? 'never' : val('#f-endmode'), startWeek: mondayOf(val('#f-startweek') || ui.cursor) };
  if (mode === 'interval') repeat.every = Math.min(52, Math.max(2, Number(val('#f-every')) || 2));
  if (repeat.end === 'count') repeat.count = Math.min(520, Math.max(1, Number(val('#f-count')) || 1));
  if (repeat.end === 'until') repeat.until = val('#f-until');
  const rem = val('#f-reminder');
  const item = {
    id: existing?.id || uid(), kind, title: val('#f-title').trim(), days, allDay,
    start: allDay ? null : val('#f-start') || '09:00',
    end: allDay || kind === 'task' ? null : val('#f-end') || null,
    color: f.querySelector('input[name="color"]:checked')?.value || 'blue',
    notes: val('#f-notes').trim(), reminder: rem === '' ? null : Number(rem),
    skip: existing?.skip || [], repeat,
  };
  let error = '';
  if (!item.title) error = 'Give it a title.';
  else if (!days.length) error = 'Pick at least one day of the week.';
  else if (kind === 'event' && !allDay && item.end && toMinutes(item.end) <= toMinutes(item.start))
    error = 'The end time needs to be after the start time.';
  else if (repeat.end === 'until' && !repeat.until) error = 'Choose the date this routine ends.';
  else if (repeat.end === 'until' && repeat.until < repeat.startWeek) error = 'The end date is before the starting week.';
  return { item, error };
}

function firstOccurrence(item, from = mondayOf(item.repeat.startWeek)) {
  for (let i = 0; i < 366 * 2; i++) {
    const d = addDays(from, i);
    if (occursOn(item, d)) return d;
  }
  return null;
}

function previewText(item) {
  if (!item.days.length) return 'Pick at least one day.';
  const from = today() > item.repeat.startWeek ? today() : mondayOf(item.repeat.startWeek);
  const next = [];
  for (let i = 0; i < 366 * 2 && next.length < 4; i++) {
    const d = addDays(from, i);
    if (occursOn(item, d)) next.push(d);
  }
  const last = lastWeekOf(item.repeat);
  let total = '';
  if (last) {
    const occ = occurrencesInRange([{ ...item, title: item.title || '-' }], mondayOf(item.repeat.startWeek), addDays(last, 6));
    total = `${occ.length} ${occ.length === 1 ? 'day' : 'days'} in total, last on ${occ.length ? dayLabel(occ[occ.length - 1].date) : '—'}.`;
  } else total = 'No end date.';
  return `${next.length ? `<b>Next:</b> ${next.map(dayLabel).join(' · ')}` : 'No upcoming days.'}<br>${total}`;
}

/* ---------- toasts ---------- */

function toast(msg, { actions = [], timeout = 5000 } = {}) {
  const wrap = $('#toasts');
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span>${esc(msg)}</span>${actions.map((a, i) => `<button type="button" data-i="${i}">${esc(a.label)}</button>`).join('')}
    <button type="button" class="x" aria-label="Dismiss">${icon('clear')}</button>`;
  const close = () => el.remove();
  el.querySelectorAll('button[data-i]').forEach((b) =>
    b.addEventListener('click', () => {
      actions[Number(b.dataset.i)].fn();
      close();
    })
  );
  el.querySelector('.x').addEventListener('click', close);
  wrap.appendChild(el);
  if (timeout) setTimeout(close, timeout);
  while (wrap.children.length > 4) wrap.firstChild.remove();
}

/* ---------- reminders ---------- */

function reminderText(r) {
  const when = r.item.allDay || !r.item.start
    ? 'Today'
    : `${r.item.kind === 'task' ? 'Due' : 'Starts'} at ${fmtTime(toMinutes(r.item.start))}`;
  return { title: r.item.title, body: `${when}${r.item.notes ? ` · ${r.item.notes}` : ''}` };
}

function showOccurrence(id, date) {
  if (!itemById(id)) return;
  ui.cursor = date;
  ui.sel = { kind: 'item', id, date };
  ui.scrollPending = true;
  render();
}

// In a browser, reminders are checked while the app is open. In the phone
// apps the operating system delivers them instead (see native.js).
async function checkReminders() {
  if (!S().reminders || isNative) return;
  const due = dueReminders(state);
  if (!due.length) return;
  for (const r of due) state.notified[r.key] = Date.now();
  pruneNotified(state.notified);
  persist();
  for (const r of due) {
    const { body } = reminderText(r);
    const shown = document.hidden ? await showSystemNotification(r.item.title, body, r.key) : false;
    if (!shown) {
      toast(`⏰ ${r.item.title} — ${body}`, {
        timeout: 0,
        actions: [
          { label: 'Mark done', fn: () => setStatus(r.item.id, r.date, 'done') },
          { label: 'Show', fn: () => showOccurrence(r.item.id, r.date) },
        ],
      });
      if (!document.hidden) showSystemNotification(r.item.title, body, r.key);
    }
  }
}

/* ---------- events ---------- */

document.addEventListener('click', async (e) => {
  const actEl = e.target.closest('[data-act]');
  const act = actEl?.dataset.act;
  if (act) {
    e.stopPropagation();
    const selItem = ui.sel?.kind === 'item' ? ui.sel : null;
    switch (act) {
      case 'cycle': {
        const { id, date } = actEl.dataset;
        ui.sel = { kind: 'item', id, date };
        setStatus(id, date, NEXT_STATUS[statusOf(id, date)]);
        return;
      }
      case 'set-status': return selItem && setStatus(selItem.id, selItem.date, actEl.dataset.status);
      case 'new-event':
      case 'new-task': {
        const kind = act === 'new-task' ? 'task' : 'event';
        const cell = ui.sel?.kind === 'cell' ? ui.sel : null;
        return openEditor({ kind, date: cell?.date || ui.cursor, min: cell?.min ?? null });
      }
      case 'edit': return selItem && openEditor({ id: selItem.id, date: selItem.date });
      case 'delete': return selItem && deleteSelected();
      case 'undo': return undo();
      case 'today': ui.cursor = today(); ui.scrollPending = true; return render();
      case 'prev': return step(-1);
      case 'next': return step(1);
      case 'view-day': return setView('day');
      case 'view-week': return setView('week');
      case 'view-month': return setView('month');
      case 'goto-day': return gotoDay(actEl.dataset.date);
      case 'sheet': return setView(actEl.dataset.view);
      case 'toggle-reminders':
        S().reminders = !S().reminders;
        persist();
        render();
        if (S().reminders && isNative && ui.perm === 'prompt') await askPermission();
        return toast(S().reminders ? 'Reminders on' : 'Reminders off');
      case 'allow-notify': {
        const p = await askPermission();
        render();
        if (p === 'granted') return toast('Notifications allowed');
        return toast(isNative ? 'Notifications not allowed — you can turn them on later in Settings' : 'Notifications not allowed — reminders will appear inside the app');
      }
      case 'exact-alarm':
        await openExactAlarmSetting();
        return refreshPermission();
      case 'test-notify': {
        if (isNative) {
          const sent = await sendTestNotification();
          return toast(sent ? 'A test reminder will arrive in a few seconds' : 'Allow notifications first, then try again');
        }
        const shown = await showSystemNotification('Ultra Planner reminder', 'This is what a reminder looks like.', 'test');
        return toast(shown ? 'Test notification sent' : '⏰ Test reminder — this is how reminders appear inside the app');
      }
      case 'export': return exportData();
      case 'import': return $('#importFile').click();
      case 'copy-data': return copyData();
      case 'load-sample': {
        const ok = await ask({ title: 'Load the sample routine?', body: 'This replaces everything currently in your routine.',
          buttons: [{ label: 'Cancel', value: null }, { label: 'Replace with sample', value: true, tone: 'danger' }] });
        if (ok) commit(() => { const s = sampleState(); s.settings = state.settings; state = s; ui.sel = null; });
        return;
      }
      case 'clear-all': case 'clear-sample': {
        const ok = act === 'clear-sample' || (await ask({ title: 'Clear everything?', body: 'Every event, task, and status will be removed. You can undo right after.',
          buttons: [{ label: 'Cancel', value: null }, { label: 'Clear everything', value: true, tone: 'danger' }] }));
        if (ok) commit(() => { state = { ...emptyState(state.settings), notified: {} }; ui.sel = null; });
        if (ok) toast('Cleared — double-click any cell or press New event to start your routine', { actions: [{ label: 'Undo', fn: undo }] });
        return;
      }
      case 'keep-sample': state.sample = false; persist(); return render();
    }
    return;
  }

  const tab = e.target.closest('.rtab');
  if (tab) { ui.tab = tab.dataset.tab; return renderRibbon(); }

  const itemEl = e.target.closest('.blk, .chip');
  if (itemEl) {
    const { id, date } = itemEl.dataset;
    if (isDoubleClick(`i|${id}|${date}`)) return openEditor({ id, date });
    ui.sel = { kind: 'item', id, date };
    return render();
  }
  const cell = e.target.closest('[data-cell]');
  if (cell) {
    const type = cell.dataset.cell;
    const date = cell.dataset.date;
    const min = type === 'time' ? minFromEvent(e, cell) : null;
    if (isDoubleClick(`c|${date}|${min}`)) {
      return openEditor({ kind: type === 'allday' ? 'task' : 'event', date, min });
    }
    ui.sel = { kind: 'cell', date, min };
    $('#sheet').focus({ preventScroll: true });
    return render();
  }
});

// The grid re-renders on every click, so double-clicks are detected by
// hand: the browser loses track once the element under the pointer is replaced.
let lastClick = { key: '', t: 0 };
function isDoubleClick(key) {
  const now = Date.now();
  const dbl = lastClick.key === key && now - lastClick.t < 450;
  lastClick = dbl ? { key: '', t: 0 } : { key, t: now };
  return dbl;
}

function minFromEvent(e, col) {
  const grid = col.closest('.grid');
  const start = Number(grid.dataset.start);
  const hourPx = S().view === 'day' ? 64 : 52;
  const y = e.clientY - col.getBoundingClientRect().top;
  return Math.max(0, Math.min(24 * 60 - 30, start * 60 + Math.floor(y / (hourPx / 2)) * 30));
}

document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.id === 'jump' && t.value) { ui.cursor = t.value; ui.scrollPending = true; return render(); }
  if (t.id === 'dayStart' || t.id === 'dayEnd') { S()[t.id] = Number(t.value); persist(); return render(); }
  if (t.id.startsWith('opt-')) { S()[t.id.slice(4)] = t.checked; persist(); return render(); }
  if (t.id === 'defaultLead') { S().defaultLead = t.value === '' ? '' : Number(t.value); return persist(); }
  if (t.id === 'allDayAt' && t.value) { S().allDayReminderAt = t.value; persist(); return renderRibbon(); }
  if (t.id === 'importFile' && t.files[0]) importFile(t.files[0]);
});

// Ribbon tabs: arrow keys move between tabs.
$('.rtabs').addEventListener('keydown', (e) => {
  if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  const tabs = [...document.querySelectorAll('.rtab')];
  const i = tabs.findIndex((t) => t.dataset.tab === ui.tab);
  const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
  ui.tab = n.dataset.tab;
  renderRibbon();
  n.focus();
});

const fx = $('#fx');
fx.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    const sel = ui.sel;
    if (sel?.kind === 'item') {
      const item = itemById(sel.id);
      const title = fx.value.trim();
      if (title && title !== item.title) commit(() => (item.title = title));
    } else quickAdd(fx.value);
    fx.value = '';
    fx.blur();
    $('#sheet').focus({ preventScroll: true });
    renderFormula();
  } else if (e.key === 'Escape') {
    fx.value = '';
    fx.blur();
    renderFormula();
    $('#sheet').focus({ preventScroll: true });
  }
});
fx.addEventListener('blur', () => setTimeout(renderFormula, 0));

document.addEventListener('keydown', (e) => {
  if (document.querySelector('dialog[open]')) return;
  const tag = e.target.tagName;
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(tag)) return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); return undo(); }
  if (mod || e.altKey) return;
  const sel = ui.sel;
  const view = S().view;

  if (e.key.startsWith('Arrow')) {
    if (tag === 'BUTTON' && e.target.closest('.rtabs')) return;
    e.preventDefault();
    let date = sel?.date || ui.cursor;
    let min = sel?.kind === 'cell' ? sel.min : sel?.kind === 'item' ? (itemById(sel.id).allDay ? null : toMinutes(itemById(sel.id).start)) : 9 * 60;
    if (min != null) min = Math.floor(min / 30) * 30;
    const dx = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
    const dy = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
    if (view === 'month') { date = addDays(date, dx + dy * 7); min = null; }
    else {
      date = addDays(date, dx);
      if (dy) {
        if (min == null) min = dy > 0 ? S().dayStart * 60 : null;
        else if (dy < 0 && min <= 0) min = null;
        else min = Math.min(24 * 60 - 30, min + dy * 30);
      }
    }
    ui.sel = { kind: 'cell', date, min };
    if (!visibleDays().includes(date)) ui.cursor = date;
    render();
    const box = $('.selbox, .is-sel');
    box?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    return;
  }
  if (e.key === 'Escape') { ui.sel = null; return render(); }
  if (!sel) return;
  if (e.key === 'Enter') {
    e.preventDefault();
    if (sel.kind === 'item') return openEditor({ id: sel.id, date: sel.date });
    return openEditor({ kind: sel.min == null && view !== 'month' ? 'task' : 'event', date: sel.date, min: sel.min });
  }
  if (sel.kind === 'item') {
    if (e.key === ' ') { e.preventDefault(); return setStatus(sel.id, sel.date, NEXT_STATUS[statusOf(sel.id, sel.date)]); }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); return deleteSelected(); }
  }
  if (sel.kind === 'cell' && e.key.length === 1 && e.key !== ' ') {
    // Start typing on a selected cell, like a spreadsheet.
    e.preventDefault();
    fx.focus();
    fx.value = e.key;
  }
});

/* ---------- import / export ---------- */

function exportJson() {
  return JSON.stringify({ app: 'power', version: 1, exported: new Date().toISOString(),
    items: state.items, status: state.status, settings: state.settings }, null, 2);
}

async function exportData() {
  if (isNative) {
    try {
      if (await shareExport(exportJson(), `ultra-planner-routine-${today()}.json`)) return;
    } catch {
      /* share sheet dismissed or unavailable: fall back to the clipboard */
    }
    return copyData();
  }
  try {
    const url = URL.createObjectURL(new Blob([exportJson()], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `ultra-planner-routine-${today()}.json` });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Exported your routine as a .json file', { actions: [{ label: 'Copy as text instead', fn: copyData }] });
  } catch {
    copyData();
  }
}

async function copyData() {
  try {
    await navigator.clipboard.writeText(exportJson());
    toast('Copied your routine to the clipboard');
  } catch {
    toast('Couldn’t reach the clipboard here — use Export instead');
  }
}

function importFile(file) {
  const reader = new FileReader();
  reader.onload = async () => {
    let data;
    try {
      data = normalize(JSON.parse(reader.result));
    } catch {
      return toast('That file isn’t an Ultra Planner export — choose a .json file saved from File › Export');
    }
    const ok = await ask({ title: `Import ${data.items.length} items?`, body: 'This replaces the routine that’s here now.',
      buttons: [{ label: 'Cancel', value: null }, { label: 'Replace and import', value: true, tone: 'danger' }] });
    if (ok) commit(() => { state = { ...data, sample: false }; ui.sel = null; });
  };
  reader.readAsText(file);
  $('#importFile').value = '';
}

/* ---------- boot ---------- */

if (!isNative && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

await initNative({
  describeReminder: reminderText,
  onReminderAction: ({ id, date, action }) => {
    if (action === 'done' && itemById(id)) setStatus(id, date, 'done');
    showOccurrence(id, date);
  },
  onBack: () => {
    const open = document.querySelector('dialog[open]');
    if (open) {
      open.close();
      return true;
    }
    return false;
  },
  onResume: () => {
    render();
    refreshPermission();
    syncReminders(state);
  },
});

render();
persist();
setInterval(() => { updateNowLine(); checkReminders(); }, 30000);
checkReminders();
document.addEventListener('visibilitychange', () => { if (!document.hidden) { checkReminders(); render(); } });
refreshPermission().then((p) => {
  // First launch in the phone app: ask once, since reminders are a core feature.
  if (isNative && p === 'prompt' && S().reminders) askPermission();
});
