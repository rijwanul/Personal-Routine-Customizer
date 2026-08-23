# Personal Routine Customizer

A drag-and-drop class routine builder that runs entirely in your browser — no
sign-up, no server, no account. Build a weekly timetable, drag courses onto
it, and export it whenever you need a copy.

## What it does

- **Grid-based routine**: days run left to right, time slots run top to
  bottom. Both are fully customizable from Settings — add, rename, reorder,
  or remove days and time slots.
- **Course bank**: create courses once (name, code, teacher, mobile number,
  section, CR info, and more — every field is optional and can be renamed or
  turned off in Settings), then drag them onto the grid. The same course can
  be placed multiple times across the week.
- **Overlapping classes**: a single time slot can hold more than one course
  — they stack as cards in that cell.
- **Per-placement details**: click any card on the grid to add a room number
  or note, or to see the course's full details (teacher, phone, CR, etc.).
- **Drag to move**: drag a placed card to a different day/time to reschedule
  it.
- **Import / export**:
  - Export/import your whole routine as a `.txt` file (a simple, readable
    format you can back up or transfer between devices).
  - Export the routine grid as a clean **PNG** or **PDF** for printing or
    sharing.
- **Installable app (PWA)**: install it to your phone or desktop home
  screen. Once installed (or even just visited once), it keeps working
  fully offline — your routine is saved in the browser itself.

## Using it

1. Open **Settings** (gear icon) to set up your days and time slots the way
   your institution schedules classes, and to turn on/off or relabel any
   course fields you don't need.
2. Open the **course bank** (list icon) and add your courses.
3. Drag a course card from the bank onto the day/time cell where it belongs.
4. Click a placed card to add a room number, a note, or to see the teacher
   and CR details at a glance.
5. Use the **download icon** in the top bar to export your routine as a
   `.txt` backup, or as a PNG/PDF for printing.

## Data & privacy

Everything you enter is stored locally in your browser's storage on your own
device. Nothing is uploaded anywhere. Clearing your browser's site data (or
using a different browser/device) will start you with a fresh, empty
routine unless you've exported and re-imported a `.txt` backup.

## Installing as an app

Most browsers will show an "Install" or "Add to Home Screen" option when you
visit the page (or from the browser's menu). Once installed, it opens in its
own window and works without an internet connection.

## Files

| File | Purpose |
|---|---|
| `index.html` | App structure |
| `styles.css` | Visual design |
| `app.js` | All app logic (state, grid, drag & drop, import/export) |
| `manifest.json` | PWA install metadata |
| `sw.js` | Offline caching (service worker) |
| `icons/` | App icons |

## Tech notes

- No build step — plain HTML/CSS/JS, works by opening `index.html` or
  serving the folder over any static file host.
- PNG/PDF export uses `html2canvas` and `jsPDF`, loaded from a CDN only when
  you actually use those export options (an internet connection is needed
  the first time you use them; not needed for day-to-day use).
- Icons via [Lucide](https://lucide.dev).
