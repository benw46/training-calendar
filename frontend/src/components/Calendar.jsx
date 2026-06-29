import { useRef, useEffect } from 'react'
import WeekRow from './WeekRow'
import { getMondayOf, addWeeks, addDays, toYMD } from '../utils/dates'
import { useWorkouts } from '../hooks/useWorkouts'

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function Calendar({ onDayClick, onCardClick, onMenuClick, reloadRef }) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const currentMonday = getMondayOf(today)

  // 7 weeks: 3 before, current, 3 after
  const weeks = Array.from({ length: 7 }, (_, i) => addWeeks(currentMonday, i - 3))
  const rangeStart = toYMD(weeks[0])
  const rangeEnd   = toYMD(addDays(weeks[weeks.length - 1], 6))

  const { workoutsByDate, loading, error, reload } = useWorkouts(rangeStart, rangeEnd)

  // Expose reload so App.jsx can call it after mutations
  useEffect(() => {
    if (reloadRef) reloadRef.current = reload
  }, [reloadRef, reload])

  const todayRef = useRef(null)
  useEffect(() => {
    todayRef.current?.scrollIntoView({ block: 'center' })
  }, [])

  return (
    <div className="calendar">
      <div className="calendar-day-names">
        {DAY_NAMES.map(name => (
          <div key={name} className="day-name">{name}</div>
        ))}
        <div className="day-name day-name--summary"></div>
      </div>

      {error && <div className="calendar-error">Could not reach backend: {error}</div>}

      <div className="calendar-body">
        {loading && !Object.keys(workoutsByDate).length && (
          <div className="calendar-loading">Loading…</div>
        )}
        {weeks.map((monday) => {
          const key = toYMD(monday)
          const isCurrentWeek = key === toYMD(currentMonday)
          return (
            <div key={key} ref={isCurrentWeek ? todayRef : null}>
              <WeekRow
                monday={monday}
                today={today}
                workoutsByDate={workoutsByDate}
                onDayClick={onDayClick}
                onCardClick={onCardClick}
                onMenuClick={onMenuClick}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
