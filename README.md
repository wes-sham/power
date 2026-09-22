# Power — weekly routine planner

Most planners make you build your schedule one day at a time. **Power** lets you set
your routine once — classes, shifts, practices, chores — and it repeats automatically,
week after week.

It's laid out like a spreadsheet: a ribbon of commands on top, a formula bar, a grid
where columns are days and rows are hours, and sheet tabs at the bottom to switch
between **Day**, **Week**, and **Month**.

## What it does

| Requirement | How Power handles it |
| --- | --- |
| List events and tasks, mark them off | Events (timed blocks) and tasks (all-day or due at a time). Each one has a status glyph you click to cycle **Not started → Working → Done**. Circle = event, square = task. |
| Repeat on chosen weekdays | Pick any days (with presets like *Mon · Wed · Fri* and *Tue · Thu*), then choose **Every week**, **Every few weeks** (every *N* weeks), or **One week only**. End it **never**, **after a number of weeks**, or **on a date** (e.g. the last day of the semester). The editor previews the next dates and how many there'll be in total. |
| Reminders | Per-item reminders (at start, 5/10/15/30/60 minutes, or 1 day before). They show as system notifications when allowed, and as in-app alerts with a **Mark done** button otherwise. |
| Intuitive to add and update | Double-click any cell, or select a cell and just start typing, then press Enter (like entering a value in a spreadsheet). Keyboard: arrows move, Enter opens, Space changes status, Delete removes (this day only, or every week), Ctrl/⌘+Z undoes. |
| One-time payment | No accounts, no servers, no subscription. Everything is stored on the device, and it installs as an app (PWA) so it can be sold as a one-time purchase. See [Distribution](#distribution). |
| Excel-inspired, scales by view | Ribbon (File / Home / View / Reminders), a name box that shows the cell reference (`C14` = the 3rd day column, 2 PM row), and a status bar with counts and % complete. Week view shows full blocks; Month view shrinks items to one-line chips with “+N more”; Day view adds notes and the repeat rule. |

The first launch loads a sample student routine so there's something to look at. Clear it
from the yellow bar or from **File › Clear everything**.

## Running it

No build step and no dependencies. You need Node 18+.

```sh
npm start        # serves the app at http://localhost:5173
npm test         # runs the recurrence + reminder tests
```

Any static file server works too (`python3 -m http.server`). The app has to be served
over http(s), not opened as a file, because it uses ES modules and a service worker.

## Project layout

```
index.html            app shell (ribbon, formula bar, sheet, status bar)
css/styles.css        all styling, light + dark theme tokens
js/recurrence.js      date math and repeat rules (pure, tested)
js/reminders.js       which reminders are due, notification delivery
js/store.js           state shape, local persistence, sample routine
js/app.js             rendering and interaction
sw.js                 offline cache + notification clicks
manifest.webmanifest  install metadata
tests/                node:test suites
```

### Data model

```js
{
  id, kind: 'event' | 'task', title, notes, color,
  days: [0, 2, 4],                 // Mon = 0 … Sun = 6
  allDay: false, start: '09:00', end: '09:50',
  reminder: 10,                    // minutes before, or null
  repeat: {
    mode: 'weekly' | 'interval' | 'once',
    every: 2,                      // for 'interval'
    end: 'never' | 'count' | 'until',
    count: 15, until: '2026-12-11',
    startWeek: '2026-09-07',       // any date in the first week
  },
  skip: ['2026-11-26'],            // single days removed
}
```

Status is tracked per occurrence (`"<id>|<date>"`), so marking this Tuesday's lab done
doesn't touch next week's. Dates are plain `YYYY-MM-DD` strings, so the week math can't
drift when daylight saving time changes.

## Limits

- **Reminders while closed.** A web app can only fire reminders while it's open (a
  background tab is fine). Getting reminders with the app fully closed needs a native
  wrapper with local notifications (see below) or a push server, which this app avoids
  on purpose.
- **Weeks start on Monday.**
- **Editing a repeating item changes every week of it.** To change a single day, delete
  that day only and add a one-week item.

## Distribution

Power is built to be sold once, with no subscription:

- **Web / desktop:** host the static files and let people install it as an app from the
  browser. Sell access with a one-time license through any storefront.
- **iOS / Android:** wrap it with [Capacitor](https://capacitorjs.com/) and list it as a
  paid-upfront app. The Capacitor Local Notifications plugin can then schedule reminders
  that fire even when the app is closed. That's the one piece that would need native code.
