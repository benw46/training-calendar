import { addDays, toYMD } from './dates'

function weekTotal(workoutsByDate, monday, field) {
  let total = 0
  for (let i = 0; i < 7; i++) {
    const list = workoutsByDate[toYMD(addDays(monday, i))]
    if (list) for (const w of list) total += w[field] ?? 0
  }
  return total
}

// Strength (and anything else not swim/bike/run) is bucketed into "other",
// matching SummaryPanel's own sport grouping.
function weekTotalsBySport(workoutsByDate, monday, field) {
  const totals = { swim: 0, bike: 0, run: 0, other: 0 }
  for (let i = 0; i < 7; i++) {
    const list = workoutsByDate[toYMD(addDays(monday, i))]
    if (!list) continue
    for (const w of list) {
      const bucket = w.sport === 'swim' || w.sport === 'bike' || w.sport === 'run' ? w.sport : 'other'
      totals[bucket] += w[field] ?? 0
    }
  }
  return totals
}

export function weekActualTotal(workoutsByDate, monday) {
  return weekTotal(workoutsByDate, monday, 'actual_duration_minutes')
}

export function weekPlannedTotal(workoutsByDate, monday) {
  return weekTotal(workoutsByDate, monday, 'planned_duration_minutes')
}

export function weekActualTotalsBySport(workoutsByDate, monday) {
  return weekTotalsBySport(workoutsByDate, monday, 'actual_duration_minutes')
}

export function weekPlannedTotalsBySport(workoutsByDate, monday) {
  return weekTotalsBySport(workoutsByDate, monday, 'planned_duration_minutes')
}

export function computeDelta(current, previous) {
  if (previous === 0) return { kind: 'new' }
  const pct = Math.round(((current - previous) / previous) * 100)
  return { kind: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat', pct }
}
