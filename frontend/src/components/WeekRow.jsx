import DayColumn from './DayColumn'
import SummaryPanel from './SummaryPanel'
import { addDays, toYMD } from '../utils/dates'

export default function WeekRow({ monday, today, workoutsByDate = {}, onDayClick, onCardClick, onReordered }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i))

  return (
    <div className="week-row">
      {days.map((date) => {
        const ymd = toYMD(date)
        return (
          <DayColumn
            key={ymd}
            date={date}
            today={today}
            workouts={workoutsByDate[ymd] ?? []}
            onDayClick={onDayClick}
            onCardClick={onCardClick}
            onReordered={onReordered}
          />
        )
      })}
      <SummaryPanel workoutsByDate={workoutsByDate} days={days} today={today} />
    </div>
  )
}
