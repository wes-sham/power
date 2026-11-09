# Google Play listing: everything to paste or upload

Files in this folder:

| Play Console field | File | Size / requirement |
| --- | --- | --- |
| App icon | `icon-512.png` | 512 × 512 PNG ✓ |
| Feature graphic | `feature-graphic.png` | 1024 × 500 PNG ✓ |
| Phone screenshots (2–8) | `screenshots/1-week.png` … `5-reminders.png` | 1080 × 1920 PNG, 9:16 ✓ |
| App bundle | `android/app/build/outputs/bundle/release/app-release.aab` | built with `npm run bundle:android` |

---

## Main store listing

**App name** (30 characters max)
```
Ultra Planner: Weekly Routine
```
> Search Google Play before you publish. Similar names already exist ("Ultimate Planner",
> "Ulti-Planner"), so keep the full name "Ultra Planner" and don't shorten it to "Ultra".

**Short description** (80 characters max)
```
Set your weekly routine once and it repeats, week after week. No subscription.
```

**Full description** (4000 characters max)
```
Most planners make you fill in your schedule one day at a time. Ultra Planner lets you set your routine once — classes, work shifts, practices, chores — and it repeats automatically, week after week.

SET IT ONCE
• Pick the days: Mon/Wed/Fri, Tue/Thu, weekdays, or any mix
• Repeat every week, every few weeks, or just for one week
• End it after a number of weeks, on a date (like the last day of the semester), or never
• See the next dates before you save, so you know it's right

TRACK YOUR PROGRESS
• Events and tasks, each with its own status: Not started, Working, or Done
• Every week's status is separate — finishing this Tuesday's lab doesn't touch next week's
• A progress bar shows how much of your week is done

REMINDERS THAT ACTUALLY ARRIVE
• Remind yourself at start time, 5 to 60 minutes before, or a day early
• Reminders come from your phone, so they arrive even when Ultra Planner is closed
• Tap "Mark done" right on the notification

A LAYOUT YOU ALREADY KNOW
• Spreadsheet-style grid: days across, hours down
• Switch between Day, Week, and Month — items shrink to fit so it never gets cluttered
• Tap a cell and start typing to add something there
• Undo anything

PRIVATE AND YOURS
• One-time purchase. No subscription, no ads, no account
• Your routine stays on your phone — nothing is uploaded
• Export a backup whenever you want
• Works offline
• Dark mode

Built by a student, for anyone whose week has a rhythm: classes, jobs, clubs, the gym, and everything in between.
```

**App category:** Productivity
**Tags:** Planner, Calendar, To-do list (pick what Play offers)
**Contact email:** your email (shown publicly on the listing)
**Privacy policy URL:**
```
https://github.com/wes-sham/power/blob/claude/weekly-routine-app-design-w9eb02/PRIVACY.md
```
> Fill in your contact email at the bottom of `PRIVACY.md` first. If the code moves to the
> `main` branch, the URL becomes `https://github.com/wes-sham/power/blob/main/PRIVACY.md`.

---

## App content (Policy › App content in Play Console)

**Privacy policy:** the URL above.

**Ads:** No, my app does not contain ads.

**App access:** All functionality is available without special access (no login).

**Content rating** (IARC questionnaire): category **Utility, Productivity, Communication,
or Other**. Answer **No** to every question (no violence, user-generated content sharing,
gambling, location sharing, purchases of digital goods, etc.). Expected rating:
**Everyone / PEGI 3**.

**Target audience:** choose **13–15, 16–17, and 18+**. Leaving out under-13 keeps the app out
of the stricter Families program, and the app isn't designed for young children.

**News app:** No.

**Data safety:**
- Does your app collect or share any of the required user data types? **No**
- That's the whole form. Ultra Planner stores data only on the device and sends nothing over the
  network, which Google doesn't count as "collected".

**Government app / Financial features / Health:** No / None / No.

**Exact alarms:** the app uses `SCHEDULE_EXACT_ALARM` so reminders fire on time. If Play
Console asks you to justify it, say it's a calendar/planner app and the permission is used
only for reminders at times the user picks.

---

## Pricing (Monetize › App pricing)

1. Set up a **payments profile** first (Play Console › Settings › Payments profile). Google
   needs it before you can sell anything.
2. Set the app to **Paid** and pick a price. **You can change a paid app to free later, but
   never a free app to paid.**

---

## Before production: required testing for new accounts

Google requires new personal developer accounts to run a **closed test with at least 12
testers who stay opted in for 14 days in a row** before the app can go to production.
Upload the same `.aab` to a closed testing track, add testers by email, and share the
opt-in link. Friends and classmates with Android phones count.
