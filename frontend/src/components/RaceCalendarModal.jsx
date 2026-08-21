import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { api } from '../api/workouts'
import { toYMD, MIN_YEAR, MAX_YEAR } from '../utils/dates'
import WorkoutModal from './WorkoutModal'

const MONTH_NAMES_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const WEEKDAY_LETTERS = ['M','T','W','T','F','S','S']

// Monday-first grid of cells for one month: `null` for the leading/trailing
// padding days outside the month, matching the Monday-start week used
// everywhere else in the app (Calendar.jsx's DAY_NAMES). Always padded out
// to a full 6 rows (42 cells) — a month only ever needs 4-6 depending on its
// length and which weekday it starts on, but padding every month to the
// same 6 keeps every month card's calendar the same height, so cards only
// differ in height when one has enough events to need more room than that.
function buildMonthCells(year, month) {
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7 // Mon=0..Sun=6
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = Array(firstWeekday).fill(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length < 42) cells.push(null)
  return cells
}

// "3 days to go" / "Today" / "12 days ago" — mirrors the wording the old
// header event banner used, extended to cover events already in the past
// since this view shows a whole year (not just what's upcoming).
function countdownLabel(dateStr, today) {
  const days = Math.round((new Date(dateStr + 'T00:00:00') - today) / 86400000)
  if (days === 0) return 'Today'
  if (days > 0) return `${days} day${days === 1 ? '' : 's'} to go`
  const ago = -days
  return `${ago} day${ago === 1 ? '' : 's'} ago`
}

function MonthCard({ year, month, eventsByDate, monthEvents, todayYMD, today, onDayClick, onEventClick, onGoToDate }) {
  const cells = useMemo(() => buildMonthCells(year, month), [year, month])

  return (
    <div className="race-month">
      <div className="race-month__calendar">
        <div className="race-month__title-row">
          <h3 className="race-month__title">{MONTH_NAMES_SHORT[month]}</h3>
          <span
            className="race-month__calendar-goto-btn"
            onClick={() => onGoToDate(`${year}-${String(month + 1).padStart(2, '0')}-01`)}
          >
            Go to…
          </span>
        </div>
        <div className="race-month__weekdays">
          {WEEKDAY_LETTERS.map((l, i) => (
            <span key={i} className="race-month__weekday">{l}</span>
          ))}
        </div>
        <div className="race-month__days">
          {cells.map((d, i) => {
            if (d == null) return <span key={i} className="race-month__day race-month__day--empty" />
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
            const dayEvents = eventsByDate[dateStr]
            const classes = ['race-month__day']
            if (dateStr === todayYMD) classes.push('race-month__day--today')
            if (dayEvents?.length) classes.push('race-month__day--event')
            return (
              <button
                key={i}
                type="button"
                className={classes.join(' ')}
                onClick={() => onDayClick(dateStr, dayEvents)}
                title={dayEvents?.length ? dayEvents.map(e => e.name).join(', ') : 'Add event'}
              >
                {d}
              </button>
            )
          })}
        </div>
      </div>

      <span className="race-month__divider" aria-hidden="true" />

      <div className="race-month__events">
        {monthEvents.length === 0 && (
          <span className="race-month__events-empty">No events</span>
        )}
        {monthEvents.map(ev => {
          const isPast = ev.date < todayYMD
          return (
            <button
              key={ev.id}
              type="button"
              className="race-month__event"
              onClick={() => onEventClick(ev)}
            >
              <span className="race-month__event-name">
                {ev.name}
                {isPast && ev.event_time && (
                  <span className="race-month__event-time">
                    <span className="race-month__event-time-sep">: </span>
                    {ev.event_time}
                  </span>
                )}
              </span>
              <span className="race-month__event-countdown">{countdownLabel(ev.date, today)}</span>
              <span
                className="race-month__event-goto"
                onClick={e => { e.stopPropagation(); onGoToDate(ev.date) }}
              >
                Go to…
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function RaceCalendarModal({ onClose, onWorkoutsChanged, onGoToDate }) {
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [events, setEvents] = useState(null)
  const [error, setError] = useState(null)
  const [dayModal, setDayModal] = useState(null) // { type: 'add', date } | { type: 'edit', workout }
  const close = useCallback(onClose, [onClose])
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }, [])
  const todayYMD = useMemo(() => toYMD(today), [today])

  // Bumped on every loadEvents() call; a response only gets committed if its
  // sequence number is still the latest one issued. Without this, flipping
  // years quickly can let an older year's request resolve after a newer
  // one's and silently overwrite it — showing the wrong year's events under
  // the right year's label (mirrors MobileDayView's loadSeqRef guard).
  const loadSeqRef = useRef(0)

  // Skipped while the inner add/edit form is open — that form has its own
  // Escape handler, and without this guard both would fire on the same
  // keypress, closing the form and the whole Race Calendar at once.
  useEffect(() => {
    if (dayModal) return
    function onKey(e) { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [close, dayModal])

  const loadEvents = useCallback(() => {
    const seq = ++loadSeqRef.current
    api.list(`${year}-01-01`, `${year}-12-31`)
      .then(list => {
        if (seq !== loadSeqRef.current) return
        setEvents(list.filter(w => w.sport === 'event'))
        setError(null)
      })
      .catch(err => {
        if (seq !== loadSeqRef.current) return
        setError(err.message)
      })
  }, [year])

  useEffect(() => { loadEvents() }, [loadEvents])

  const eventsByDate = useMemo(() => {
    const map = {}
    for (const ev of events ?? []) {
      (map[ev.date] ??= []).push(ev)
    }
    return map
  }, [events])

  // One bucket per month, sorted by date — feeds each month card's event
  // list on the right of its dividing line.
  const eventsByMonth = useMemo(() => {
    const buckets = Array.from({ length: 12 }, () => [])
    for (const ev of events ?? []) {
      buckets[Number(ev.date.slice(5, 7)) - 1].push(ev)
    }
    for (const bucket of buckets) bucket.sort((a, b) => a.date.localeCompare(b.date))
    return buckets
  }, [events])

  function handleDayClick(dateStr, dayEvents) {
    if (dayEvents?.length) setDayModal({ type: 'edit', workout: dayEvents[0] })
    else setDayModal({ type: 'add', date: dateStr })
  }

  function handleEventClick(workout) {
    setDayModal({ type: 'edit', workout })
  }

  function handleGoToDate(dateStr) {
    onGoToDate(dateStr)
    close()
  }

  function handleModalSaved() {
    setDayModal(null)
    loadEvents()
    onWorkoutsChanged?.()
  }

  function handleModalDeleted() {
    setDayModal(null)
    loadEvents()
    onWorkoutsChanged?.()
  }

  function handleBackdrop(e) {
    if (e.target === e.currentTarget) close()
  }

  return (
    <div className="modal-backdrop" onClick={handleBackdrop}>
      <div className="modal modal--wide race-calendar-modal" role="dialog" aria-modal="true">
        <div className="modal-header">
          <h2 className="modal-title">Race Calendar</h2>
          <div className="race-calendar-year-nav">
            <button
              type="button"
              className="race-calendar-year-btn"
              onClick={() => setYear(Math.min(MAX_YEAR, Math.max(MIN_YEAR, today.getFullYear())))}
            >
              Current Year
            </button>
            <button
              type="button"
              className="race-calendar-year-btn"
              onClick={() => setYear(y => Math.max(MIN_YEAR, y - 1))}
              disabled={year <= MIN_YEAR}
              aria-label="Previous year"
            >
              &lsaquo;
            </button>
            <span className="race-calendar-year-label">{year}</span>
            <button
              type="button"
              className="race-calendar-year-btn"
              onClick={() => setYear(y => Math.min(MAX_YEAR, y + 1))}
              disabled={year >= MAX_YEAR}
              aria-label="Next year"
            >
              &rsaquo;
            </button>
          </div>
          <button className="modal-close" onClick={close} aria-label="Close">✕</button>
        </div>

        {error && <div className="modal-submit-error">Couldn't load events — {error}</div>}
        {!error && !events && <div className="graph-loading">Loading…</div>}

        {events && (
          <div className="race-calendar-body">
            {MONTH_NAMES_SHORT.map((_, month) => (
              <MonthCard
                key={month}
                year={year}
                month={month}
                eventsByDate={eventsByDate}
                monthEvents={eventsByMonth[month]}
                todayYMD={todayYMD}
                today={today}
                onDayClick={handleDayClick}
                onEventClick={handleEventClick}
                onGoToDate={handleGoToDate}
              />
            ))}
          </div>
        )}
      </div>

      {dayModal && (
        <WorkoutModal
          workout={dayModal.type === 'edit' ? dayModal.workout : null}
          initialDate={dayModal.type === 'add' ? dayModal.date : null}
          initialSport={dayModal.type === 'add' ? 'event' : undefined}
          onClose={() => setDayModal(null)}
          onSaved={handleModalSaved}
          onDeleted={handleModalDeleted}
        />
      )}
    </div>
  )
}
