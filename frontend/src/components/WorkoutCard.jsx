import SportIcon from './SportIcon'
import { getCardStatus, fmtDuration, fmtDistance } from '../utils/workouts'

const STATUS_COLOR = {
  done:    '#22c55e',
  partial: '#f59e0b',
  missed:  '#ef4444',
  future:  'transparent',
}

export default function WorkoutCard({ workout, today, onClick, onMenuClick }) {
  const status = getCardStatus(workout, today)
  const barColor = STATUS_COLOR[status]

  const actualDur = fmtDuration(workout.actual_duration_minutes)
  const actualDist = fmtDistance(workout.actual_distance_km)
  const plannedDur = fmtDuration(workout.planned_duration_minutes)
  const plannedDist = fmtDistance(workout.planned_distance_km)

  function handleMenu(e) {
    e.stopPropagation()
    onMenuClick?.(workout, e)
  }

  return (
    <div className="workout-card" onClick={() => onClick?.(workout)}>
      <div className="workout-card__bar" style={{ background: barColor }} />
      <div className="workout-card__content">
        <div className="workout-card__top">
          <SportIcon sport={workout.sport} />
          <span className="workout-card__name">{workout.name}</span>
          <button className="workout-card__menu" onClick={handleMenu} aria-label="Options">⋮</button>
        </div>

        {(actualDur || actualDist) && (
          <div className="workout-card__actual">
            {actualDur && <span>{actualDur}</span>}
            {actualDist && <span>{actualDist}</span>}
          </div>
        )}

        {(plannedDur || plannedDist) && (
          <div className="workout-card__planned">
            {plannedDur && <span>P: {plannedDur}</span>}
            {plannedDist && <span>P: {plannedDist}</span>}
          </div>
        )}
      </div>
    </div>
  )
}
