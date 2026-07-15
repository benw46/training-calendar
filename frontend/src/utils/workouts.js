import { isSameDay } from './dates'

export const SPORT_COLORS = {
  swim:     '#0ea5e9',
  bike:     '#8b5cf6',
  run:      '#22c55e',
  strength: '#6b7280',
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

export function fmtDuration(minutes) {
  if (minutes == null) return null
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}:${String(m).padStart(2, '0')}`
}

export function fmtDistance(km) {
  if (km == null) return null
  return `${km % 1 === 0 ? km : km.toFixed(1)} km`
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
