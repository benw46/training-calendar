import { useState, useEffect, useCallback, useRef } from 'react'
import DayColumn from './DayColumn'
import SummaryPanel from './SummaryPanel'
import { addDays, toYMD, isSameDay, getMondayOf, MIN_DATE, MAX_DATE } from '../utils/dates'
import { listToByDate } from '../utils/workouts'
import { api } from '../api/workouts'

export default function MobileDayView({
  reloadRef, scrollToTodayRef, jumpToDateRef, onMonthChange,
  onDayClick, onCardClick,
}) {
  const [today] = useState(() => {
    const t = new Date()
    t.setHours(0, 0, 0, 0)
    return t
  })

  const [selectedDate, setSelectedDate] = useState(today)
  const [workoutsByDate, setWorkoutsByDate] = useState({})
  const [error, setError] = useState(null)

  // Each call to load() (prev/next day taps fire one apiece) starts an
  // independent request, and nothing otherwise stops an older one from
  // resolving after a newer one — on a slow/flaky mobile connection response
  // order isn't guaranteed to match request order, so without this a stale
  // response can land last and silently overwrite fresher data (surfacing as
  // e.g. the delta badge reverting to "New" and sticking there). Bumping a
  // counter per call and only committing the response whose count still
  // matches the latest issued one discards any response that's been
  // superseded by a more recent load() before it had a chance to resolve.
  const loadSeqRef = useRef(0)

  // SummaryPanel needs the whole selected week's data plus the previous
  // week's (for the delta-vs-last-week comparison), not just the one
  // visible day, so the fetch window covers both weeks.
  const load = useCallback((date) => {
    const seq = ++loadSeqRef.current
    const monday = getMondayOf(date)
    const start = toYMD(addDays(monday, -7))
    const end = toYMD(addDays(monday, 6))
    api.list(start, end)
      .then(listToByDate)
      .then(byDate => {
        if (seq !== loadSeqRef.current) return
        setWorkoutsByDate(byDate)
      })
      .catch(err => {
        if (seq !== loadSeqRef.current) return
        setError(err.message)
      })
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
    // Defensive clamp — App.jsx's month nav already stops short of
    // MIN_DATE/MAX_DATE, but this keeps the ref itself safe regardless of
    // what calls it.
    if (jumpToDateRef) jumpToDateRef.current = (date) => setSelectedDate(date < MIN_DATE ? MIN_DATE : date > MAX_DATE ? MAX_DATE : date)
  }, [jumpToDateRef])

  function handlePrevDay() { setSelectedDate(d => { const next = addDays(d, -1); return next < MIN_DATE ? d : next }) }
  function handleNextDay() { setSelectedDate(d => { const next = addDays(d, 1); return next > MAX_DATE ? d : next }) }

  const atMinDay = selectedDate.getTime() <= MIN_DATE.getTime()
  const atMaxDay = selectedDate.getTime() >= MAX_DATE.getTime()

  function handleReordered() {
    load(selectedDate)
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
        <button className="mobile-day-nav__btn" onClick={handlePrevDay} disabled={atMinDay} aria-label="Previous day">
          &lsaquo;
        </button>
        <div className="mobile-day-nav__center">
          <span
            className={`mobile-day-nav__label${isSameDay(selectedDate, today) ? ' mobile-day-nav__label--today' : ''}`}
            onClick={() => onDayClick?.(selectedDate)}
          >
            {isSameDay(selectedDate, today) ? 'Today' : dateLabel}
          </span>
          {hasEvent && <span className="mobile-day-nav__race-day">RACE DAY</span>}
        </div>
        <button className="mobile-day-nav__btn" onClick={handleNextDay} disabled={atMaxDay} aria-label="Next day">
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
          onReordered={handleReordered}
          hideHeader
        />

        <div className="mobile-summary-panel">
          <SummaryPanel workoutsByDate={workoutsByDate} days={weekDays} today={today} onReordered={handleReordered} />
        </div>
      </div>
    </div>
  )
}
