<div align="center">

# 📅 MyRoutine Customizer

**A drag-and-drop class routine builder that runs entirely in your browser.**
No sign-up. No server required. No account needed. Your data stays yours.

[![Visitors](https://api.visitorbadge.io/api/visitors?path=rijwanul%2FPersonal-Routine-Customizer&label=Visitors&countColor=%234C5FD5&style=flat)](https://visitorbadge.io)
![PWA](https://img.shields.io/badge/PWA-installable-4C5FD5?style=flat&logo=pwa&logoColor=white)
![No Build Step](https://img.shields.io/badge/build%20step-none-7CA982?style=flat)
![Offline First](https://img.shields.io/badge/works-offline-D9A441?style=flat)
![License](https://img.shields.io/badge/license-MIT-C4593F?style=flat)

*Build a weekly timetable, drag courses onto it, and export it whenever you need a copy.*

</div>

---

## ✨ What it does

| | |
|---|---|
| 🗓️ **Grid-based routine** | Days run left to right, time slots run top to bottom. Both are fully customizable from Settings — add, rename, reorder, or remove days and time slots. |
| 📚 **Course bank** | Create courses once (name, teacher, section, and more — every field is optional, and can be renamed, reordered, or turned off in Settings, or you can add your own custom fields). The course editor keeps the essentials up front and tucks the rest behind "See more". Drag courses onto the grid — the same course can be placed multiple times across the week. |
| 🧷 **Slot fields** | Per-placement details like room number and a note for that specific class — configurable the same way as course fields (add, rename, reorder, or turn off in Settings), since these can differ every time you place the same course. |
| ➕ **Bulk add courses** | Paste a whole course list at once — with or without codes — and the app parses it into ready-to-add course cards. *(Optional — enable in Settings → Features.)* |
| 🧩 **Overlapping classes** | A single time slot can hold more than one course — they stack as cards in that cell. |
| 🖊️ **Per-placement details** | Click any card on the grid to add a room number or note, or to see the course's full details (teacher, phone, CR, etc.). |
| ↔️ **Drag to move** | Drag a placed card to a different day/time to reschedule it. |
| 📤 **Import / export** | Back up or transfer your whole routine as a `.txt` file, or export the grid as a clean **PNG** or **PDF** for printing/sharing. |
| ☁️ **Optional cloud sync** | Sign in with a username and password to sync your routine across devices — everything still works fully offline without an account too. |
| 📱 **Installable app (PWA)** | Install it to your phone or desktop home screen. Once installed (or even just visited once), it keeps working fully offline. |

---

## 🚀 Using it

1. Open **Settings** ⚙️ to set up your days and time slots the way your institution schedules classes, and to turn on/off or relabel any course fields you don't need.
2. Open the **course bank** 📋 and add your courses — one at a time, or in bulk if you've enabled that feature.
3. **Drag** a course card from the bank onto the day/time cell where it belongs.
4. **Click** a placed card to add a room number, a note, or to see the teacher and CR details at a glance.
5. Use the **download icon** ⬇️ in the top bar to export your routine as a `.txt` backup, or as a PNG/PDF for printing.

---

## 🔒 Data & privacy

Everything you enter is stored locally in your browser's storage on your own device. Nothing is uploaded anywhere by default.

> **Note:** If you choose to sign in (optional), your routine also syncs to your account so you can pick it up on another device. Skip sign-in entirely and everything still works — purely offline, purely local.

Clearing your browser's site data (or using a different browser/device without signing in) will start you with a fresh, empty routine unless you've exported and re-imported a `.txt` backup.

---

## 📲 Installing as an app

Most browsers will show an **"Install"** or **"Add to Home Screen"** option when you visit the page (or from the browser's menu). Once installed, it opens in its own window and works without an internet connection.

---

## 🗂️ Files

| File | Purpose |
|---|---|
| `index.html` | App structure |
| `styles.css` | Visual design |
| `app.js` | All app logic (state, grid, drag & drop, import/export, bulk add) |
| `auth.js` | Optional account sign-in + cloud sync (Firebase) |
| `manifest.json` | PWA install metadata |
| `sw.js` | Offline caching (service worker) |
| `icons/` | App icons |

---

## 🛠️ Tech notes

- **No build step** — plain HTML/CSS/JS, works by opening `index.html` or serving the folder over any static file host.
- PNG/PDF export uses `html2canvas` and `jsPDF`, loaded from a CDN only when you actually use those export options (an internet connection is needed the first time you use them; not needed for day-to-day use).
- Optional account sign-in uses Firebase Authentication + Firestore, loaded only if configured — the rest of the app has zero dependency on it.
- Icons via [Lucide](https://lucide.dev).

---

<div align="center">

Made with 🩵 for anyone tired of messy paper routines.

</div>
