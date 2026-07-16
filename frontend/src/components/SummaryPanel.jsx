import { toYMD, addDays, getMondayOf } from '../utils/dates'
import { SPORT_COLORS, fmtDuration } from '../utils/workouts'
import {
  weekActualTotal, weekPlannedTotal,
  weekActualTotalsBySport, weekPlannedTotalsBySport,
  computeDelta,
} from '../utils/weeklyTotals'

const ROWS = [
  { key: 'total', label: 'Total', color: '#374151' },
  { key: 'swim',  label: 'Swim',  color: SPORT_COLORS.swim },
  { key: 'bike',  label: 'Bike',  color: SPORT_COLORS.bike },
  { key: 'run',   label: 'Run',   color: SPORT_COLORS.run },
  { key: 'other', label: 'Other', color: SPORT_COLORS.other },
]

const SPORT_ROWS = ROWS.filter(r => r.key !== 'total')

function deltaText(delta) {
  if (delta.kind === 'new')  return 'New'
  if (delta.kind === 'up')   return `▲ +${delta.pct}%`
  if (delta.kind === 'down') return `▼ ${delta.pct}%`
  return `– ${delta.pct}%`
}

// 'down' is split into two colors by severity: -1% to -25% is a mild dip
// (yellow), -26% or worse is a serious drop-off (red).
function deltaClassSuffix(delta) {
  if (delta.kind !== 'down') return delta.kind
  return delta.pct <= -26 ? 'down-severe' : 'down-mild'
}

function DeltaBadge({ delta, sportDeltas, explanation }) {
  return (
    <span className="summary-delta" tabIndex={0}>
      <span className={`summary-delta-badge summary-delta-badge--${deltaClassSuffix(delta)}`}>
        {deltaText(delta)}
      </span>
      <div className="summary-delta-popover">
        <div className="summary-delta-popover__explanation">{explanation}</div>
        <div className="summary-delta-popover__title">Delta by sport</div>
        {sportDeltas.map(sd => (
          <div key={sd.key} className="summary-delta-popover__row">
            <span className="summary-delta-popover__dot" style={{ background: sd.color }} />
            <span className="summary-delta-popover__label">{sd.label}</span>
            <span className={`summary-delta-badge summary-delta-badge--${deltaClassSuffix(sd.delta)}`}>
              {deltaText(sd.delta)}
            </span>
          </div>
        ))}
      </div>
    </span>
  )
}

export default function SummaryPanel({ workoutsByDate, days, today }) {
  const workouts = days.flatMap(d => workoutsByDate[toYMD(d)] ?? [])

  const actualByKey  = { total: 0, swim: 0, bike: 0, run: 0, other: 0 }
  const plannedByKey = { total: 0, swim: 0, bike: 0, run: 0, other: 0 }
  for (const w of workouts) {
    const actual  = w.actual_duration_minutes ?? 0
    const planned = w.planned_duration_minutes ?? 0
    actualByKey.total  += actual
    plannedByKey.total += planned

    const bucket = w.sport === 'swim' || w.sport === 'bike' || w.sport === 'run' ? w.sport : 'other'
    actualByKey[bucket]  += actual
    plannedByKey[bucket] += planned
  }

  // The delta bar's formula depends on where this week sits relative to
  // today: a past week is fully known, so it's judged on what actually
  // happened; the current week is still in flight, so its plan is judged
  // against last week's real result; a future week has no actual data yet
  // for either side, so it's plan-vs-plan.
  const prevMonday  = addDays(days[0], -7)
  const weekYMD     = toYMD(days[0])
  const todayWeekYMD = toYMD(getMondayOf(today))
  const isPast    = weekYMD < todayWeekYMD
  const isCurrent = weekYMD === todayWeekYMD

  let deltaLabel, deltaExplanation, currentSide, previousSide, previousBySport
  if (isPast) {
    deltaLabel       = 'Actual Delta:'
    deltaExplanation = "This week's actual duration vs. last week's actual duration achieved."
    currentSide      = actualByKey
    previousSide     = weekActualTotal(workoutsByDate, prevMonday)
    previousBySport  = weekActualTotalsBySport(workoutsByDate, prevMonday)
  } else if (isCurrent) {
    deltaLabel       = 'Delta to last week:'
    deltaExplanation = "This week's planned duration vs. last week's actual duration achieved."
    currentSide      = plannedByKey
    previousSide     = weekActualTotal(workoutsByDate, prevMonday)
    previousBySport  = weekActualTotalsBySport(workoutsByDate, prevMonday)
  } else {
    deltaLabel       = 'Delta to last week:'
    deltaExplanation = "This week's planned duration vs. last week's planned duration."
    currentSide      = plannedByKey
    previousSide     = weekPlannedTotal(workoutsByDate, prevMonday)
    previousBySport  = weekPlannedTotalsBySport(workoutsByDate, prevMonday)
  }

  const totalDelta = computeDelta(currentSide.total, previousSide)
  const sportDeltas = SPORT_ROWS.map(({ key, label, color }) => ({
    key, label, color,
    delta: computeDelta(currentSide[key], previousBySport[key]),
  }))

  return (
    <div className="summary-panel">
      {ROWS.map(({ key, label, color }) => {
        const planned = plannedByKey[key]
        const pct = planned > 0 ? Math.min(actualByKey[key] / planned, 1) : 0
        return (
          <div key={key} className="summary-row-group">
            {key === 'total' && (
              <div className="summary-delta-bar">
                <div className="summary-delta-row">
                  <span className="summary-delta-bar__label">{deltaLabel}</span>
                  <DeltaBadge
                    delta={totalDelta}
                    sportDeltas={sportDeltas}
                    explanation={deltaExplanation}
                  />
                </div>
              </div>
            )}
            <div className={`summary-row${key === 'total' ? ' summary-row--total' : ''}`}>
              <span className="summary-row__dot" style={{ background: color }} />
              <span className="summary-row__label">{label}</span>
              <span className="summary-row__planned-value">{fmtDuration(plannedByKey[key])}h</span>
              <span className="summary-row__value">{fmtDuration(actualByKey[key])}h</span>
            </div>
            {key !== 'total' && (
              <div className="summary-row__progress">
                <div
                  className="summary-row__progress-fill"
                  style={{ width: `${pct * 100}%`, background: color }}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
