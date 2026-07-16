import SportIcon from './SportIcon'
import { getCardStatus, fmtDuration, fmtDistance, STATUS_BAR_COLOR } from '../utils/workouts'

export default function WorkoutCard({
  workout, today, onClick,
  isDragging, isDragOver, onDragStart, onDragOver, onDrop, onDragEnd,
  titleRowRef,
}) {
  const status = getCardStatus(workout, today)
  const barColor = STATUS_BAR_COLOR[status]

  // Strength has no meaningful distance, so that field never shows for it —
  // just duration, same layout as every other sport minus the distance column.
  const isStrength = workout.sport === 'strength'

  const actualDur = fmtDuration(workout.actual_duration_minutes)
  const actualDist = isStrength ? null : fmtDistance(workout.actual_distance_km)
  const plannedDur = fmtDuration(workout.planned_duration_minutes)
  const plannedDist = isStrength ? null : fmtDistance(workout.planned_distance_km)

  const isEvent = workout.sport === 'event'
  const daysUntil = isEvent
    ? Math.round((new Date(workout.date + 'T00:00:00') - today) / 86400000)
    : null
  const countdownLabel = daysUntil == null
    ? null
    : daysUntil > 0
      ? `${daysUntil} days until…`
      : daysUntil === 0
        ? 'Today'
        : `${Math.abs(daysUntil)} days ago`

  const className = [
    'workout-card',
    `workout-card--${status}`,
    isEvent && 'workout-card--event',
    workout.sport === 'note' && 'workout-card--note',
    isDragging && 'workout-card--dragging',
    isDragOver && 'workout-card--drag-over',
  ].filter(Boolean).join(' ')

  return (
    <div
      className={className}
      draggable
      onClick={() => onClick?.(workout)}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <div className="workout-card__bar" style={{ background: barColor }} />
      <div className="workout-card__content">
        {isEvent && (
          <p className="workout-card__countdown">{countdownLabel}</p>
        )}
        <div className="workout-card__top">
          <span className="workout-card__title-group" ref={titleRowRef}>
            <SportIcon sport={workout.sport} />
            <span className="workout-card__name">{workout.name}</span>
          </span>
        </div>

        {workout.description && (
          <p className="workout-card__description">{workout.description}</p>
        )}

        {workout.sport !== 'note' && workout.sport !== 'event' && (
          <>
            {(actualDur || actualDist || plannedDur || plannedDist) && (
              <div className="workout-card__stats">
                {(actualDur || actualDist) && (
                  <div className="workout-card__actual">
                    {actualDur && (
                      <>
                        <span className="workout-card__stat-label workout-card__stat-label--duration">A:</span>
                        <span className="workout-card__stat-value workout-card__stat-value--duration">{actualDur}h</span>
                      </>
                    )}
                    {actualDist && (
                      <>
                        <span className="workout-card__stat-label workout-card__stat-label--distance">A:</span>
                        <span className="workout-card__stat-value workout-card__stat-value--distance">{actualDist}</span>
                      </>
                    )}
                  </div>
                )}
                {(plannedDur || plannedDist) && (
                  <div className="workout-card__planned">
                    {plannedDur && (
                      <>
                        <span className="workout-card__stat-label workout-card__stat-label--duration">P:</span>
                        <span className="workout-card__stat-value workout-card__stat-value--duration">{plannedDur}h</span>
                      </>
                    )}
                    {plannedDist && (
                      <>
                        <span className="workout-card__stat-label workout-card__stat-label--distance">P:</span>
                        <span className="workout-card__stat-value workout-card__stat-value--distance">{plannedDist}</span>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
