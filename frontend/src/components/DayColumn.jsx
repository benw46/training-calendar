import { isSameDay, formatDayHeader } from '../utils/dates'

export default function DayColumn({ date, today, workouts = [], onDayClick }) {
  const isToday = isSameDay(date, today)
  const isPast = date < today && !isToday
  const { primary, secondary } = formatDayHeader(date, today)

  return (
    <div className={`day-column${isPast ? ' day-past' : ''}`}>
      <div className={`day-header${isToday ? ' day-header--today' : ''}`}>
        <span className="day-header__primary">{primary}</span>
        {secondary && <span className="day-header__secondary">{secondary}</span>}
      </div>
      <div className="day-body" onClick={() => onDayClick?.(date)}>
        {workouts}
      </div>
    </div>
  )
}
