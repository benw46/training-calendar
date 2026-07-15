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

## Core Feature: Garmin Sync
A manual "Sync from Garmin" button (not background polling) that pulls
recent activities from Garmin Connect and matches them to planned workouts.

### Library and auth
- Use the unofficial `python-garminconnect` Python library (logs into
  Garmin Connect directly with user credentials — no Garmin developer
  application or public server required).
- Credentials (Garmin username/email and password) are read from
  **environment variables** (e.g. `GARMIN_EMAIL`, `GARMIN_PASSWORD`),
  never hardcoded or committed to git. Add a `.env.example` file showing
  the required variable names, and ensure `.env` is in `.gitignore`.

### Sync behavior
- Triggered by a button in the UI — e.g. "Sync from Garmin" placed
  somewhere sensible in the header/toolbar.
- On click: backend fetches recent activities from Garmin Connect (last
  7 days is a sensible window — covers anything you might have forgotten
  to sync).
- For each Garmin activity, extract: date, sport type, duration, distance.
- **Matching logic** — find a planned workout to attach the actual values
  to, using date + sport type:
  - **Exactly one planned workout matches** (same date, same sport) → write
    the Garmin actual duration/distance into that workout's actual fields.
  - **Multiple planned workouts match** (same date, same sport — e.g. two
    runs logged the same day) → match to whichever has the closest planned
    duration to the actual duration. If still tied, match to whichever was
    created first.
  - **No planned workout matches** (an activity exists in Garmin with no
    corresponding planned entry that day/sport) → create a new workout
    entry for that date and sport, with actual values filled in and planned
    fields left blank. This entry should NOT get a red/yellow/green color
    (there's nothing planned to compute a percentage against) — treat
    "logged with no plan" as its own neutral visual state (e.g. grey),
    distinct from the white "not yet due" state.
- Sync should not create duplicate entries if run more than once — if a
  Garmin activity has already been matched/imported in a previous sync
  (track this with a `garmin_activity_id` field on the workout), skip it.
- Show a simple result after sync completes (e.g. "3 activities synced, 1
  unmatched" as plain text/toast — no need for a detailed report UI).

### Data model addition
Add to the Workout model:
- `garmin_activity_id` (string, optional, nullable) — Garmin's unique ID
  for the synced activity, used to prevent re-importing the same activity
  on subsequent syncs.

### Card color coding addition
| Status | Condition | Color |
|---|---|---|
| Unplanned/logged | Actual values exist but no planned values (came from an unmatched Garmin sync) | Grey |

## Explicitly Out of Scope (do not build)
- User accounts / login / auth
- Multiple users
- Fitness/Fatigue/Form, CTL/ATL/TSB, TSS, rTSS
- Pace/power/heart-rate zone analysis
- Elevation gain tracking
- Strava integration or .fit file upload (Garmin sync is now in scope — see
  below)
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
10. Garmin sync: install `python-garminconnect`, read credentials from env
    vars, implement the "Sync from Garmin" button, fetch + match logic per
    the rules above. Test with a real activity from your account before
    considering this stage done — don't just test against mock data, since
    Garmin's actual response shape is the main source of risk here.

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
