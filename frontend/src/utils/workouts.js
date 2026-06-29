export function getCardStatus(workout, today) {
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
    return (ad != null || ak != null) ? 'done' : 'missed'
  }

  if (pct === 0) return 'missed'
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
