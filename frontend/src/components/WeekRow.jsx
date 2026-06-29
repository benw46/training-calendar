import DayColumn from './DayColumn'
import SummaryPanel from './SummaryPanel'
import { addDays } from '../utils/dates'

export default function WeekRow({ monday, today, workoutsByDate = {}, onDayClick }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i))

  return (
    <div className="week-row">
      {days.map((date, i) => {
        const ymd = date.toISOString().slice(0, 10)
        return (
          <DayColumn
            key={i}
            date={date}
            today={today}
            workouts={workoutsByDate[ymd] ?? []}
            onDayClick={onDayClick}
          />
        )
      })}
      <SummaryPanel workoutsByDate={workoutsByDate} days={days} />
    </div>
  )
}
