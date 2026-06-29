# Triathlon Training Calendar — Build Spec (v2)

## Purpose
A minimal personal training log to replace TrainingPeaks for one user (me).
Visually modeled on TrainingPeaks' weekly calendar (see reference screenshots),
but stripped to just: planned workouts, logged actuals, and a simple
weekly duration summary. No coaching features, no fitness/fatigue/form
modeling, no charts.

## Tech Stack
- **Frontend:** React (Vite), plain CSS (no UI framework needed unless it
  speeds things up — your call)
- **Backend:** Python, FastAPI
- **Database:** SQLite (single file, no external DB server)
- **Run target:** Local development only, accessed via browser on one laptop.
  No deployment, no auth, no multi-device sync needed.

## Core Feature: Week View Calendar
- Displays weeks **Monday to Sunday**, seven day-columns in a row.
- **Infinite scroll, vertical**, through past and future weeks. Weeks stack
  top to bottom in chronological order:
  ```
  Week n-1
  ----------------
  Week n      <- current week, visible on initial load
  ----------------
  Week n+1
  ```
  Scrolling up loads earlier weeks; scrolling down loads later weeks. No
  "back/next week" buttons required. A "jump to today" button is a
  nice-to-have, not required.
- Each day column header shows the date number.
  - **Today's column header is highlighted dark blue** (matching the "Today
    29" styling in the reference screenshot), with the word "Today" plus
    the date number.
  - All other day headers are unstyled/neutral.
- Each day shows the workout(s) logged for that day as stacked cards (a day
  can have multiple workouts — e.g. a swim + run brick).

## Core Feature: Workout Cards
Each workout renders as a card in its day column, showing:
- Sport icon (swim / bike / run / strength / other — simple icon per sport)
- Workout name/notes (free text, e.g. "Easy Spin", "Brick - Easy Run")
- **Actual** duration (h:mm:ss or h:mm — your call, just be consistent) and
  **actual distance** (km), if logged
- **Planned** duration ("P: h:mm:ss") and **planned distance** ("P: x.x km"),
  shown below the actual values
- A "⋮" menu icon (top-right of card) for edit/delete — opens the same
  modal as clicking the card body

### Card color coding
The colored bar/background on each card reflects completion status,
**calculated only for workouts whose date has already passed** (i.e. today
or earlier):

| Status | Condition | Color |
|---|---|---|
| Not yet due | Workout date is in the future | White / neutral (no color) |
| Missed | Date has passed, 0% of planned duration or distance logged | Red |
| Partially done | Date has passed, >0% and ≤80% of planned achieved | Yellow |
| Done | Date has passed, >80% of planned achieved | Green |

**Percentage-achieved calculation:** compare actual vs. planned for
**duration**. If duration isn't planned/logged for a workout but distance
is, fall back to distance for the percentage calculation. (Duration is the
primary metric; distance is the fallback — not averaged together.)

A workout with no actual logged at all, where the date has passed, is 0%
achieved → red.

## Core Feature: Add/Edit Workout
- Clicking empty space in a day column opens a **modal form** to add a new
  workout to that date.
- Clicking an existing workout card (not the ⋮ menu) opens the same modal
  pre-filled, for editing.
- Form fields:
  - **Sport** — dropdown: Swim / Bike / Run / Strength / Other
  - **Date** — pre-filled from the clicked day, but editable
  - **Name/Notes** — free text (e.g. "Easy Spin")
  - **Planned duration** — h:mm:ss
  - **Planned distance** — km (optional)
  - **Actual duration** — h:mm:ss (optional, blank until logged)
  - **Actual distance** — km (optional, blank until logged)
  - **Status** — checkbox or toggle: Planned / Done
    (this is a manual flag the user sets — separate from, and does not
    override, the automatic red/yellow/green color calculation above)
- Modal has Save, Cancel, and (when editing) Delete.

## Core Feature: Weekly Summary Panel
To the right of each week's seven day-columns, a summary panel shows, for
that week, **total logged actuals** (not planned) as hours and minutes,
in this order:
1. Total Duration
2. Swim Duration
3. Bike Duration
4. Run Duration
5. Other Duration (covers Strength + Other combined)

No Fitness/Fatigue/Form (CTL/ATL/TSB), no TSS, no elevation gain, no
distance totals in this panel — duration only, the five rows above.

## Data Model
Workout:
- id
- date
- sport (enum: swim, bike, run, strength, other)
- name (text — short label, e.g. "Easy Spin")
- planned_duration_minutes (integer, optional)
- planned_distance_km (float, optional)
- actual_duration_minutes (integer, optional)
- actual_distance_km (float, optional)
- completed (boolean, default false) — manual planned/done flag, independent
  of the calculated color status

## Explicitly Out of Scope (do not build)
- User accounts / login / auth
- Multiple users
- Fitness/Fatigue/Form, CTL/ATL/TSB, TSS, rTSS
- Pace/power/heart-rate zone analysis
- Elevation gain tracking
- File upload or device sync (Garmin/Strava/.fit files)
- Month view (week view only, for now)
- Mobile app / PWA packaging
- Deployment / hosting config
- Checkmark icon on completed workouts (the color coding is sufficient;
  no separate ✓ indicator)

## Build Approach (for Claude Code)
Please build this incrementally and let me check in between stages rather
than building everything at once:
1. Scaffold the project (FastAPI backend + React frontend, basic structure).
2. Backend: SQLite schema + CRUD API endpoints for workouts.
3. Frontend: static week view UI with hardcoded/mock data — day columns,
   Mon–Sun, today highlighted dark blue.
4. Add workout cards with mock data: sport icon, name, actual + planned
   values, color coding logic (use a fixed "today" date for testing edge
   cases — future/past/today).
5. Wire frontend to backend (real data, fetch workouts for visible week
   range).
6. Add the modal form: create, edit, delete workouts (planned + actual
   fields, status toggle).
7. Add the weekly summary panel (sum actual durations by sport, per week).
8. Implement infinite scroll across weeks (test scroll-up/prepend
   behavior specifically — this is the trickiest part technically).
9. Basic styling pass — clean and readable, not fancy.

After each stage, run it and confirm it works before moving to the next.
Commit to git after each working stage.

## Open Decisions Left to Claude Code's Judgment
- Exact infinite scroll implementation (virtualized list vs. simple
  load-more-on-scroll is fine — simplicity over performance here, this is a
  single-user local app).
- How initial load determines "current week" position on mount — just
  needs to land on today's week without a visible jump.
- Exact icon set for sports (any reasonably clear icon per sport is fine).
- Component structure / file layout.
- Whether to use a CSS framework or hand-rolled styles — favor simple and
  fast to implement.
