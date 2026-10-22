import { addDays, toYMD } from './dates'

// The sport buckets that a week's duration Total adds up. In training mode
// Other (stretching, pilates, mobility) is left out so Total measures
// strenuous training only. Shared by the weekly totals panel and the
// year-long duration graph so both report the same figure.
export const TRAINING_TOTAL_KEYS = ['swim', 'bike', 'run', 'gym']
export const STUDY_TOTAL_KEYS    = ['study', 'review', 'create']

export function sumKeys(byKey, keys) {
  return keys.reduce((sum, k) => sum + (byKey[k] ?? 0), 0)
}

// Anything not swim/bike/run/strength(gym)/study/review/create is bucketed
// into "other", matching SummaryPanel's own sport grouping. The study/
// review/create buckets only ever hold anything in Study mode (workouts
// never carry those sports, and study sessions never carry any other), so
// one shared function serves both modes without either needing to filter
// the other's rows out first.
function weekTotalsBySport(workoutsByDate, monday, field) {
  const totals = { swim: 0, bike: 0, run: 0, gym: 0, other: 0, study: 0, review: 0, create: 0 }
  for (let i = 0; i < 7; i++) {
    const list = workoutsByDate[toYMD(addDays(monday, i))]
    if (!list) continue
    for (const w of list) {
      const bucket = w.sport === 'swim' || w.sport === 'bike' || w.sport === 'run'
        || w.sport === 'study' || w.sport === 'review' || w.sport === 'create'
        ? w.sport
        : w.sport === 'strength' ? 'gym' : 'other'
      totals[bucket] += w[field] ?? 0
    }
  }
  return totals
}

export function weekActualTotalsBySport(workoutsByDate, monday) {
  return weekTotalsBySport(workoutsByDate, monday, 'actual_duration_minutes')
}

export function weekPlannedTotalsBySport(workoutsByDate, monday) {
  return weekTotalsBySport(workoutsByDate, monday, 'planned_duration_minutes')
}

export function weekActualDistancesBySport(workoutsByDate, monday) {
  return weekTotalsBySport(workoutsByDate, monday, 'actual_distance_km')
}

export function weekPlannedDistancesBySport(workoutsByDate, monday) {
  return weekTotalsBySport(workoutsByDate, monday, 'planned_distance_km')
}

export function computeDelta(current, previous) {
  // Nothing either week is no change, not "New" — otherwise an empty future
  // week, or a sport you didn't do in either week, would be badged as new.
  if (previous === 0) return current === 0 ? { kind: 'flat', pct: 0 } : { kind: 'new' }
  const pct = Math.round(((current - previous) / previous) * 100)
  return { kind: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat', pct }
}
