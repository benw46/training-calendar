import { toYMD } from '../utils/dates'

const SPORT_COLOR = {
  swim:     '#0ea5e9',
  bike:     '#8b5cf6',
  run:      '#22c55e',
  strength: '#f97316',
  other:    '#6b7280',
}

function fmtDuration(minutes) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}:${String(m).padStart(2, '0')}`
}

const ROWS = [
  { key: 'total', label: 'Total',    color: '#374151', sports: null },
  { key: 'swim',  label: 'Swim',     color: SPORT_COLOR.swim,     sports: ['swim'] },
  { key: 'bike',  label: 'Bike',     color: SPORT_COLOR.bike,     sports: ['bike'] },
  { key: 'run',   label: 'Run',      color: SPORT_COLOR.run,      sports: ['run'] },
  { key: 'other', label: 'Other',    color: SPORT_COLOR.other,    sports: ['strength', 'other'] },
]

export default function SummaryPanel({ workoutsByDate, days }) {
  const workouts = days.flatMap(d => workoutsByDate[toYMD(d)] ?? [])

  const byKey = { total: 0, swim: 0, bike: 0, run: 0, other: 0 }
  for (const w of workouts) {
    const mins = w.actual_duration_minutes ?? 0
    byKey.total += mins
    if (w.sport === 'swim')                        byKey.swim  += mins
    else if (w.sport === 'bike')                   byKey.bike  += mins
    else if (w.sport === 'run')                    byKey.run   += mins
    else                                           byKey.other += mins
  }

  return (
    <div className="summary-panel">
      {ROWS.map(({ key, label, color }) => (
        <div key={key} className={`summary-row${key === 'total' ? ' summary-row--total' : ''}`}>
          <span className="summary-row__dot" style={{ background: color }} />
          <span className="summary-row__label">{label}</span>
          <span className="summary-row__value">{fmtDuration(byKey[key])}</span>
        </div>
      ))}
    </div>
  )
}
