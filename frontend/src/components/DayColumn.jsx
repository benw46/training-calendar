import WorkoutCard from './WorkoutCard'
import { isSameDay, formatDayHeader } from '../utils/dates'

export default function DayColumn({ date, today, workouts = [], onDayClick, onCardClick, onMenuClick }) {
  const isToday = isSameDay(date, today)
  const { primary, secondary } = formatDayHeader(date, today)

  function handleBodyClick(e) {
    if (e.target.closest('.workout-card')) return
    onDayClick?.(date)
  }

  return (
    <div className="day-column">
      <div className={`day-header${isToday ? ' day-header--today' : ''}`}>
        <span className="day-header__primary">{primary}</span>
        {secondary && <span className="day-header__secondary">{secondary}</span>}
      </div>
      <div className="day-body" onClick={handleBodyClick}>
        {workouts.map(w => (
          <WorkoutCard
            key={w.id}
            workout={w}
            today={today}
            onClick={onCardClick}
            onMenuClick={onMenuClick}
          />
        ))}
      </div>
    </div>
  )
}
