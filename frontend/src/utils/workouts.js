import { isSameDay } from './dates'

export const SPORT_COLORS = {
  swim:     '#0ea5e9',
  bike:     '#8b5cf6',
  run:      '#22c55e',
  strength: '#f97316',
  other:    '#6b7280',
  note:     '#d97706',
  event:    '#fbbf24',
}

export const STATUS_BAR_COLOR = {
  done:      '#16a34a',
  partial:   '#facc15',
  missed:    '#f43f5e',
  future:    'transparent',
  unplanned: '#9ca3af',
}

export function getCardStatus(workout, today) {
  if (workout.sport === 'note' || workout.sport === 'event') return 'future'
  const workoutDate = new Date(workout.date + 'T00:00:00')
  if (workoutDate > today) return 'future'

  const { planned_duration_minutes: pd, actual_duration_minutes: ad,
          planned_distance_km: pk, actual_distance_km: ak } = workout

  let pct
  if (pd != null && pd > 0) {
    pct = (ad ?? 0) / pd
  } else if (pk != null && pk > 0) {
    pct = (ak ?? 0) / pk
  } else {
    // No planned values: unplanned Garmin import → grey; otherwise done/missed
    if (workout.garmin_activity_id && (ad != null || ak != null)) return 'unplanned'
    return (ad != null || ak != null) ? 'done' : 'missed'
  }

  if (pct === 0) {
    // A planned duration that's still awaiting its actual isn't "missed"
    // yet if today isn't over — only flag it red once the day has passed.
    if (isSameDay(workoutDate, today) && pd != null && ad == null) return 'future'
    return 'missed'
  }
  if (pct <= 0.8) return 'partial'
  return 'done'
}

// Keeps a time field to digits punctuated as hh:mm:ss: anything that isn't
// a digit is dropped and the colons are re-inserted from what's left, so the
// only thing a keystroke can do is add or remove a digit.
//
// The digits fill from the right — seconds first, then minutes, then hours —
// which is both how a time is typed (1,2,3,4,5 lands as 1:23:45) and what
// makes this safe to re-run over a value that's already formatted. Filling
// from the left would reformat a stored one-digit-hour time like "1:23:45"
// into "12:34:5" the moment the field was edited; from the right it maps
// back to itself, as does a two-digit-hour "12:34:56".
export function maskTime(value) {
  // Past six digits the field is full, so extra keystrokes are ignored
  // rather than shifting the leading digits out.
  const digits = value.replace(/\D/g, '').slice(0, 6)
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, -2)}:${digits.slice(-2)}`
  return `${digits.slice(0, -4)}:${digits.slice(-4, -2)}:${digits.slice(-2)}`
}

export function fmtDuration(minutes) {
  if (minutes == null) return null
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}:${String(m).padStart(2, '0')}`
}

export function fmtDistance(km) {
  if (km == null) return null
  return `${km.toFixed(1)}km`
}

// A timed exercise stores its seconds in `reps` (see GymExercise in
// backend/models.py), so it needs unpacking back into m:ss for display.
export function fmtRepsTime(totalSeconds) {
  if (totalSeconds == null) return ''
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

// The m:ss value keeps its shape whatever the length; only the unit beside
// it changes — under a minute is counted in seconds, and exactly a minute is
// singular.
export function repsTimeUnit(totalSeconds) {
  if (totalSeconds == null) return 'mins'
  if (totalSeconds < 60) return 'secs'
  if (totalSeconds === 60) return 'min'
  return 'mins'
}

export function fmtExercise(ex) {
  const reps = ex.is_time ? `${fmtRepsTime(ex.reps)} ${repsTimeUnit(ex.reps)}` : ex.reps
  const setsReps = ex.sets && ex.reps ? `${ex.sets}×${reps}` : null
  const load = ex.bodyweight ? 'bodyweight' : (ex.weight != null ? `${ex.weight}kg` : null)
  const detail = [setsReps, load].filter(Boolean).join(' · ')
  return detail ? `${ex.name} — ${detail}` : ex.name
}

// A run/bike/swim interval's distance is typed as a bare number with no
// unit picker, so it's read as kilometers up to a plausible single-rep
// distance and as meters above that (nobody reps 21+ actual kilometers) —
// the number itself is never converted, only the label shown beside it.
export function distanceExerciseUnit(distance) {
  if (distance == null || distance === '') return 'km'
  return Number(distance) > 20 ? 'm' : 'km'
}

// Mirrors fmtExercise above, but a run/bike/swim interval has only reps ×
// distance — no sets/weight/bodyweight/time to fold in.
export function fmtDistanceExercise(ex) {
  const unit = distanceExerciseUnit(ex.distance)
  const detail = ex.reps && ex.distance != null ? `${ex.reps}×${ex.distance}${unit}`
    : ex.distance != null ? `${ex.distance}${unit}`
    : ex.reps ? `${ex.reps} reps`
    : null
  return detail ? `${ex.name} — ${detail}` : ex.name
}

// Copying a workout (single-card Copy, or Copy Week) resets every exercise's
// "Done" checkbox — a copy is a new plan to run through, not a record that
// the original was completed, so its checkboxes shouldn't start pre-ticked.
export function resetExercisesDone(exercises) {
  return exercises ? exercises.map(ex => ({ ...ex, done: false })) : exercises
}

export function listToByDate(list) {
  const byDate = {}
  for (const w of list) {
    if (!byDate[w.date]) byDate[w.date] = []
    byDate[w.date].push(w)
  }
  return byDate
}

const SPORT_PRIORITY = { event: 0, note: 1 } // everything else defaults to 2

// A day is always either fully unordered (every sort_order null — default
// priority applies) or fully ordered (every sort_order set by a drag), since
// dropping a reordered card persists sequential values for the whole day.
// The mixed-state branches below are defensive, not load-bearing.
export function sortDayWorkouts(workouts) {
  return [...workouts].sort((a, b) => {
    if (a.sort_order != null && b.sort_order != null) return a.sort_order - b.sort_order
    if (a.sort_order != null) return -1
    if (b.sort_order != null) return 1
    const pa = SPORT_PRIORITY[a.sport] ?? 2
    const pb = SPORT_PRIORITY[b.sport] ?? 2
    if (pa !== pb) return pa - pb
    return a.id - b.id
  })
}
