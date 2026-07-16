import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import WeekRow from './WeekRow'
import { getMondayOf, addWeeks, addDays, toYMD } from '../utils/dates'
import { listToByDate } from '../utils/workouts'
import { api } from '../api/workouts'

const DAY_NAMES     = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const BATCH         = 4
const WEEKS_BEFORE  = 6
const WEEKS_AFTER   = 3
const ROOT_MARGIN   = '150px'
// Fetched in addition to the rendered range so the earliest rendered week's
// own previous week is always loaded (needed for the week-over-week delta
// badge in SummaryPanel, without which its topmost row would have no
// predecessor to compare against).
const LOOKBACK_DAYS = 7

export default function Calendar({
  onDayClick, onCardClick,
  reloadRef, scrollToTodayRef, jumpToDateRef, onMonthChange, onWorkoutsChanged,
}) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const currentMonday    = getMondayOf(today)
  const currentMondayYMD = toYMD(currentMonday)

  const [weeks, setWeeks] = useState(() =>
    Array.from(
      { length: WEEKS_BEFORE + 1 + WEEKS_AFTER },
      (_, i) => addWeeks(currentMonday, i - WEEKS_BEFORE)
    )
  )
  const [workoutsByDate, setWorkoutsByDate] = useState({})
  const [error, setError] = useState(null)

  const scrollRef          = useRef(null)
  const topSentinelRef     = useRef(null)
  const bottomSentinelRef  = useRef(null)
  // Kept in sync *synchronously* (assigned directly wherever `weeks` is
  // decided, not via a `useEffect`) so a fast second loadMore/jump — which
  // can fire before React has committed the previous update — never reads
  // a stale array and recomputes an overlapping/duplicate week range.
  const weeksRef           = useRef(weeks)
  const prevScrollHeightRef = useRef(null)
  const loadingRef         = useRef(false)
  const todayRef           = useRef(null)
  const weekDivRefs        = useRef(new Map())   // YMD → DOM element
  const pendingScrollYMD   = useRef(null)        // target week after a date jump

  // ── Initial data load ────────────────────────────────────────
  useEffect(() => {
    const ws = weeksRef.current
    api.list(toYMD(addDays(ws[0], -LOOKBACK_DAYS)), toYMD(addDays(ws[ws.length - 1], 6)))
      .then(listToByDate)
      .then(setWorkoutsByDate)
      .catch(err => setError(err.message))
  }, [])

  // ── Scroll to today on mount ─────────────────────────────────
  useEffect(() => {
    requestAnimationFrame(() => {
      todayRef.current?.scrollIntoView({ block: 'center' })
    })
  }, [])

  // ── Track visible month via scroll ───────────────────────────
  useEffect(() => {
    const el = scrollRef.current
    if (!el || weeks.length === 0) return

    function update() {
      // Week rows aren't a uniform height (they grow with workout content),
      // so find the actual row crossing the viewport's vertical center from
      // real layout rather than estimating its index from an average row
      // height — an estimate can land on the wrong row and report the wrong
      // month. The center (rather than the top) matches where jumpToDate
      // scrolls a target row to.
      const scrollRect = el.getBoundingClientRect()
      const centerY    = scrollRect.top + scrollRect.height / 2
      let monday = weeks[weeks.length - 1]
      for (const candidate of weeks) {
        const rowEl = weekDivRefs.current.get(toYMD(candidate))
        if (rowEl && rowEl.getBoundingClientRect().bottom > centerY) {
          monday = candidate
          break
        }
      }

      // If this row contains the 1st of a month, that month owns the row's
      // label even if most of the row's days belong to the previous month
      // (e.g. a row starting Mon Jan 26 that ends Sun Feb 1 is "February").
      // Otherwise fall back to the row's Thursday to identify the month.
      let labelDate = addDays(monday, 3)
      for (let i = 0; i < 7; i++) {
        const day = addDays(monday, i)
        if (day.getDate() === 1) { labelDate = day; break }
      }
      onMonthChange?.(labelDate)
    }

    update()
    el.addEventListener('scroll', update, { passive: true })
    return () => el.removeEventListener('scroll', update)
  }, [weeks, onMonthChange])

  // ── Reload after mutations ───────────────────────────────────
  const reload = useCallback(async () => {
    const ws = weeksRef.current
    try {
      const byDate = await api
        .list(toYMD(addDays(ws[0], -LOOKBACK_DAYS)), toYMD(addDays(ws[ws.length - 1], 6)))
        .then(listToByDate)
      setWorkoutsByDate(byDate)
      setError(null)
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => { if (reloadRef) reloadRef.current = reload }, [reloadRef, reload])

  // A drag-and-drop reorder/move happens entirely inside DayColumn and never
  // goes through App's own handlers, so it has to poke onWorkoutsChanged
  // itself to keep things like the "next event" banner in sync.
  const handleReordered = useCallback(() => {
    reload()
    onWorkoutsChanged?.()
  }, [reload, onWorkoutsChanged])

  // ── Jump to an arbitrary date ─────────────────────────────────
  const jumpToDate = useCallback(async (targetDate) => {
    const targetMonday = getMondayOf(targetDate)
    const targetYMD    = toYMD(targetMonday)

    // The target week must reach the vertical center of the scroll container,
    // which means there has to be enough rendered content both above and
    // below it to fill half the viewport on each side — otherwise the
    // browser clamps scrollTop at a content boundary and the target
    // undershoots the center. WEEKS_BEFORE/WEEKS_AFTER alone aren't always
    // enough on tall viewports, so pad them out using the actual container
    // height (MIN_ROW_HEIGHT is a safe lower bound on row height, so this
    // never under-estimates how many weeks are needed).
    const MIN_ROW_HEIGHT   = 250
    const halfViewportWeeks = Math.ceil((scrollRef.current?.clientHeight ?? 0) / 2 / MIN_ROW_HEIGHT) + 1
    const weeksBefore      = Math.max(WEEKS_BEFORE, halfViewportWeeks)
    const weeksAfter       = Math.max(WEEKS_AFTER, halfViewportWeeks)

    const newWeeks = Array.from(
      { length: weeksBefore + 1 + weeksAfter },
      (_, i) => addWeeks(targetMonday, i - weeksBefore)
    )

    try {
      const byDate = await api
        .list(toYMD(addDays(newWeeks[0], -LOOKBACK_DAYS)), toYMD(addDays(newWeeks[newWeeks.length - 1], 6)))
        .then(listToByDate)

      prevScrollHeightRef.current = null  // cancel any pending prepend restoration
      pendingScrollYMD.current    = targetYMD
      weeksRef.current = newWeeks
      setWorkoutsByDate(byDate)
      setWeeks(newWeeks)
      setError(null)
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    if (jumpToDateRef) jumpToDateRef.current = jumpToDate
  }, [jumpToDateRef, jumpToDate])

  // ── Jump to today ────────────────────────────────────────────
  // todayRef.current is null after a date jump (today's week not rendered).
  // Fall back to jumpToDate so Today always works.
  useEffect(() => {
    if (scrollToTodayRef)
      scrollToTodayRef.current = () => {
        if (todayRef.current) {
          todayRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' })
        } else {
          jumpToDate(today)
        }
      }
  }, [scrollToTodayRef, jumpToDate])

  // ── Layout effects after weeks change ────────────────────────
  useLayoutEffect(() => {
    // 1. Restore scroll position after infinite-scroll prepend
    if (prevScrollHeightRef.current !== null && scrollRef.current) {
      scrollRef.current.scrollTop +=
        scrollRef.current.scrollHeight - prevScrollHeightRef.current
      prevScrollHeightRef.current = null
    }

    // 2. Scroll to target week after a jump, centered in the viewport
    if (pendingScrollYMD.current) {
      const el      = weekDivRefs.current.get(pendingScrollYMD.current)
      const scrollEl = scrollRef.current
      if (el && scrollEl) {
        const elRect      = el.getBoundingClientRect()
        const scrollElRect = scrollEl.getBoundingClientRect()
        scrollEl.scrollTop +=
          (elRect.top + elRect.height / 2) - (scrollElRect.top + scrollElRect.height / 2)
        pendingScrollYMD.current = null
      }
    }
  }, [weeks])

  // ── Load more weeks (infinite scroll) ───────────────────────
  const loadMore = useCallback(async (direction) => {
    if (loadingRef.current) return
    loadingRef.current = true
    try {
      const ws       = weeksRef.current
      const newWeeks = direction === 'up'
        ? Array.from({ length: BATCH }, (_, i) => addWeeks(ws[0], i - BATCH))
        : Array.from({ length: BATCH }, (_, i) => addWeeks(ws[ws.length - 1], i + 1))

      // Only 'up' establishes a new earliest rendered week, so only it needs
      // the extra lookback week fetched (see LOOKBACK_DAYS above).
      const rangeStart = direction === 'up'
        ? addDays(newWeeks[0], -LOOKBACK_DAYS)
        : newWeeks[0]

      const byDate = await api
        .list(toYMD(rangeStart), toYMD(addDays(newWeeks[newWeeks.length - 1], 6)))
        .then(listToByDate)

      if (direction === 'up')
        prevScrollHeightRef.current = scrollRef.current.scrollHeight

      const merged = direction === 'up' ? [...newWeeks, ...ws] : [...ws, ...newWeeks]
      weeksRef.current = merged

      setWorkoutsByDate(prev => ({ ...prev, ...byDate }))
      setWeeks(merged)
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      loadingRef.current = false
    }
  }, [])

  // ── IntersectionObserver ─────────────────────────────────────
  // The sentinel elements are always mounted at fixed positions (never
  // inside the weeks .map()), so the observer only needs to be created
  // once — `weeks` isn't referenced in here at all, and recreating it on
  // every load is needless churn.
  useEffect(() => {
    const scrollEl = scrollRef.current
    if (!scrollEl) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          if (entry.target === topSentinelRef.current)    loadMore('up')
          if (entry.target === bottomSentinelRef.current) loadMore('down')
        }
      },
      { root: scrollEl, rootMargin: ROOT_MARGIN }
    )

    if (topSentinelRef.current)    observer.observe(topSentinelRef.current)
    if (bottomSentinelRef.current) observer.observe(bottomSentinelRef.current)
    return () => observer.disconnect()
  }, [loadMore])

  return (
    <div className="calendar">
      {error && <div className="calendar-error">Couldn't load workouts — {error}</div>}
      <div className="calendar-scroll" ref={scrollRef}>
        <div className="calendar-day-names">
          {DAY_NAMES.map(name => (
            <div key={name} className="day-name">{name}</div>
          ))}
          <div className="day-name day-name--summary"></div>
        </div>

        <div className="calendar-body">
          <div ref={topSentinelRef} className="scroll-sentinel" />

          {weeks.map((monday) => {
            const key = toYMD(monday)
            return (
              <div
                key={key}
                ref={el => {
                  if (el) weekDivRefs.current.set(key, el)
                  else    weekDivRefs.current.delete(key)
                  if (key === currentMondayYMD) todayRef.current = el
                }}
              >
                <WeekRow
                  monday={monday}
                  today={today}
                  workoutsByDate={workoutsByDate}
                  onDayClick={onDayClick}
                  onCardClick={onCardClick}
                  onReordered={handleReordered}
                />
              </div>
            )
          })}

          <div ref={bottomSentinelRef} className="scroll-sentinel" />
        </div>
      </div>
    </div>
  )
}
