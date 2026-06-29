import { useRef, useEffect } from 'react'
import WeekRow from './WeekRow'
import { getMondayOf, addWeeks, toYMD } from '../utils/dates'

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function Calendar({ workoutsByDate = {}, onDayClick }) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const currentMonday = getMondayOf(today)

  // Render 3 weeks before and 3 weeks after current week
  const weeks = Array.from({ length: 7 }, (_, i) => addWeeks(currentMonday, i - 3))

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
      <div className="calendar-body">
        {weeks.map((monday, i) => {
          const isCurrentWeek = toYMD(monday) === toYMD(currentMonday)
          return (
            <div key={toYMD(monday)} ref={isCurrentWeek ? todayRef : null}>
              <WeekRow
                monday={monday}
                today={today}
                workoutsByDate={workoutsByDate}
                onDayClick={onDayClick}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
