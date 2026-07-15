import { useState, useEffect, useCallback } from 'react'
import DayColumn from './DayColumn'
import SummaryPanel from './SummaryPanel'
import { addDays, toYMD, isSameDay, getMondayOf } from '../utils/dates'
import { listToByDate } from '../utils/workouts'
import { api } from '../api/workouts'

export default function MobileDayView({
  reloadRef, scrollToTodayRef, jumpToDateRef, onMonthChange,
  onDayClick, onCardClick, onMenuClick, onWorkoutsChanged,
}) {
  const [today] = useState(() => {
    const t = new Date()
    t.setHours(0, 0, 0, 0)
    return t
  })

  const [selectedDate, setSelectedDate] = useState(today)
  const [workoutsByDate, setWorkoutsByDate] = useState({})
  const [error, setError] = useState(null)

  // SummaryPanel needs the whole selected week's data plus the previous
  // week's (for the delta-vs-last-week comparison), not just the one
  // visible day, so the fetch window covers both weeks.
  const load = useCallback((date) => {
    const monday = getMondayOf(date)
    const start = toYMD(addDays(monday, -7))
    const end = toYMD(addDays(monday, 6))
    api.list(start, end)
      .then(listToByDate)
      .then(setWorkoutsByDate)
      .catch(err => setError(err.message))
  }, [])

  useEffect(() => { load(selectedDate) }, [selectedDate, load])

  useEffect(() => { onMonthChange?.(selectedDate) }, [selectedDate, onMonthChange])

  useEffect(() => {
    if (reloadRef) reloadRef.current = () => load(selectedDate)
  }, [reloadRef, load, selectedDate])

  useEffect(() => {
    if (scrollToTodayRef) scrollToTodayRef.current = () => setSelectedDate(today)
  }, [scrollToTodayRef, today])

  useEffect(() => {
    if (jumpToDateRef) jumpToDateRef.current = (date) => setSelectedDate(date)
  }, [jumpToDateRef])

  function handlePrevDay() { setSelectedDate(d => addDays(d, -1)) }
  function handleNextDay() { setSelectedDate(d => addDays(d, 1)) }

  function handleReordered() {
    load(selectedDate)
    onWorkoutsChanged?.()
  }

  const workouts = workoutsByDate[toYMD(selectedDate)] ?? []
  const weekMonday = getMondayOf(selectedDate)
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekMonday, i))

  const dateLabel = selectedDate.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
  const hasEvent = workouts.some(w => w.sport === 'event')

  return (
    <div className="mobile-day-view">
      <div className="mobile-day-nav">
        <button className="mobile-day-nav__btn" onClick={handlePrevDay} aria-label="Previous day">
          &lsaquo;
        </button>
        <span
          className={`mobile-day-nav__label${isSameDay(selectedDate, today) ? ' mobile-day-nav__label--today' : ''}`}
          onClick={() => onDayClick?.(selectedDate)}
        >
          {isSameDay(selectedDate, today) ? 'Today' : dateLabel}
        </span>
        {hasEvent && <span className="mobile-day-nav__race-day">RACE DAY</span>}
        <button className="mobile-day-nav__btn" onClick={handleNextDay} aria-label="Next day">
          &rsaquo;
        </button>
      </div>

      {error && <div className="calendar-error">Couldn't load workouts — {error}</div>}

      <div className="mobile-day-body">
        <DayColumn
          date={selectedDate}
          today={today}
          workouts={workouts}
          onDayClick={onDayClick}
          onCardClick={onCardClick}
          onMenuClick={onMenuClick}
          onReordered={handleReordered}
          hideHeader
        />

        <div className="mobile-summary-panel">
          <SummaryPanel workoutsByDate={workoutsByDate} days={weekDays} today={today} />
        </div>
      </div>
    </div>
  )
}
