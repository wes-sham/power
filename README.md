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
| Reminders | Per-item reminders (at start, 5/10/15/30/60 minutes, or 1 day before). In the phone apps they're scheduled with the phone, so they arrive even when Power is closed, and each has a **Mark done** button. On the web they show as browser notifications or in-app alerts while the app is open. |
| Intuitive to add and update | Double-click any cell, or select a cell and just start typing, then press Enter (like entering a value in a spreadsheet). Keyboard: arrows move, Enter opens, Space changes status, Delete removes (this day only, or every week), Ctrl/⌘+Z undoes. |
| One-time payment | No accounts, no servers, no subscription. Everything is stored on the device. It ships as iPhone and Android apps (via Capacitor) that can be listed as paid, one-time-purchase apps. See [Selling it](#selling-it). |
| Excel-inspired, scales by view | Ribbon (File / Home / View / Reminders), a name box that shows the cell reference (`C14` = the 3rd day column, 2 PM row), and a status bar with counts and % complete. Week view shows full blocks; Month view shrinks items to one-line chips with “+N more”; Day view adds notes and the repeat rule. |

The first launch loads a sample student routine so there's something to look at. Clear it
from the yellow bar or from **File › Clear everything**.

## Running it in a browser

You need [Node.js](https://nodejs.org) 22 or newer.

```sh
npm install      # once
npm start        # serves the app at http://localhost:5173
npm test         # runs the recurrence, reminder, and phone-scheduling tests
```

## Building the phone apps

Power uses [Capacitor](https://capacitorjs.com) to wrap the same web app as a real
iPhone and Android app. The native projects are in `ios/` and `android/`.

### Android (Windows, Mac, or Linux)

1. Install [Android Studio](https://developer.android.com/studio). The first time it
   opens, let it download the Android SDK it suggests.
2. In this folder, run:
   ```sh
   npm install
   npm run android
   ```
   This copies the latest web app into the Android project and opens it in Android Studio.
3. Plug in your phone with USB debugging on, or start an emulator, then press the green
   **Run ▶** button.

### iPhone (needs a Mac)

1. Install **Xcode** from the Mac App Store.
2. In this folder, run:
   ```sh
   npm install
   npm run ios
   ```
3. In Xcode, pick the **App** target → **Signing & Capabilities** → choose your Apple ID
   as the Team. Then pick your iPhone or a simulator and press **Run ▶**.

### After changing the code

Edit the files in `index.html`, `css/`, and `js/` as usual, then run `npm run sync`
(or `npm run android` / `npm run ios`) to copy the changes into the phone projects.
To redraw the app icon and splash screens, edit the PNGs in `assets/` and run
`npm run assets`.

### What's different in the phone apps

- **Reminders arrive even when the app is closed.** Power schedules the next two weeks of
  reminders with the phone (up to 60, the most iOS allows) and re-plans them every time
  you change something or open the app. Tapping **Mark done** on a notification checks
  the item off without opening the app.
- **Permission is asked on first launch.** On Android 12+ you may also see an **Exact
  timing** button under Reminders. Android can delay reminders by a few minutes unless
  that's turned on.
- **Export** opens the phone's share sheet, so you can save a backup to Files, Drive,
  email, and so on.
- **Android's back button** closes an open editor before it leaves the app.
- **No internet needed.** Fonts and images are bundled, so the app never contacts a server.

## Project layout

```
index.html            app shell (ribbon, formula bar, sheet, status bar)
css/styles.css        all styling, light + dark theme tokens
js/recurrence.js      date math and repeat rules (pure, tested)
js/reminders.js       which reminders are due, notification delivery
js/store.js           state shape, local persistence, sample routine
js/native.js          phone-app features: OS reminders, share sheet, back button
js/app.js             rendering and interaction
sw.js                 offline cache + notification clicks (web only)
manifest.webmanifest  install metadata (web)
capacitor.config.json app id, name, and notification icon for the phone apps
android/, ios/        native projects generated by Capacitor
assets/               source images for the app icon and splash screen
store/                Google Play listing text, icon, feature graphic, screenshots
fonts/                bundled typefaces (SIL Open Font License)
PRIVACY.md            privacy policy (link it from the store listing)
scripts/build.js      copies the web app into www/ for Capacitor
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

- **Web reminders need the app open.** In a browser, reminders only fire while Power is
  open (a background tab is fine). The phone apps don't have this limit.
- **Phone reminders look two weeks ahead.** If you don't open the app for more than two
  weeks, reminders stop until you open it again.
- **Weeks start on Monday.**
- **Editing a repeating item changes every week of it.** To change a single day, delete
  that day only and add a one-week item.

## Building the Google Play bundle

Google Play takes one file: a signed **Android App Bundle** (`.aab`).

1. **Make an upload key, once.** In Android Studio: **Build › Generate Signed App Bundle
   or APK › Android App Bundle › Create new…**. Save it as `power-upload-key.jks` in the
   project's top folder (next to `package.json`), alias `upload`, and pick a password. Or,
   from a terminal with Java installed:
   ```sh
   keytool -genkeypair -v -keystore power-upload-key.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
   ```
2. **Tell the build where it is.** Copy `android/keystore.properties.example` to
   `android/keystore.properties` and put your password in it. Both files are ignored by
   git. Never commit or share them, and back up the `.jks` file somewhere safe.
3. **Build it:**
   ```sh
   npm run bundle:android
   ```
   The file to upload is `android/app/build/outputs/bundle/release/app-release.aab`.
4. On Play Console's first upload, keep **Play App Signing** turned on. Google then holds the
   real signing key, and if you lose your upload key you can ask Google to reset it.

For each update, raise `versionCode` (1 → 2 → 3…) and `versionName` in
`android/app/build.gradle`, then build again.

## Selling it

Power is built to be sold once, with no subscription:

- **App Store (iPhone):** join the [Apple Developer Program](https://developer.apple.com/programs/)
  ($99/year for the developer account, not for your customers). In App Store Connect,
  create the app with bundle ID `com.wessham.power`, set a price tier under
  **Pricing and Availability**, then in Xcode choose **Product › Archive** and upload.
- **Google Play (Android):** make a [Play Console](https://play.google.com/console)
  account (one-time $25), then follow [Building the Google Play bundle](#building-the-google-play-bundle).
  Everything to paste into the listing, plus the icon, feature graphic, and screenshots,
  is in [`store/`](store/LISTING.md).
- **Web:** host the static files anywhere and sell access with a one-time license.

Before you publish, change the app ID in `capacitor.config.json`, `android/app/build.gradle`
(`applicationId`), and the Xcode project (**Bundle Identifier**) if you want something
other than `com.wessham.power`. You can't change it after the app is live.
