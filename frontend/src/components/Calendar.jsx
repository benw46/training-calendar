import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import WeekRow from './WeekRow'
import { getMondayOf, addWeeks, addDays, toYMD } from '../utils/dates'
import { api } from '../api/workouts'

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const BATCH = 4

// 6 weeks above + current + 3 below = 10 initial weeks.
// After scrollIntoView(center), the top sentinel sits ~330-400 px above the
// viewport on a typical laptop — safely outside ROOT_MARGIN so the observer
// doesn't fire a spurious upward load on mount.
const WEEKS_BEFORE = 6
const WEEKS_AFTER  = 3
const ROOT_MARGIN  = '150px'

export default function Calendar({ onDayClick, onCardClick, onMenuClick, reloadRef, scrollToTodayRef }) {
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

  const scrollRef          = useRef(null)
  const topSentinelRef     = useRef(null)
  const bottomSentinelRef  = useRef(null)
  const weeksRef           = useRef(weeks)
  const prevScrollHeightRef = useRef(null)
  const loadingRef         = useRef(false)
  const todayRef           = useRef(null)

  useEffect(() => { weeksRef.current = weeks }, [weeks])

  // ── Initial data load ────────────────────────────────────────
  useEffect(() => {
    const ws = weeksRef.current
    api.list(toYMD(ws[0]), toYMD(addDays(ws[ws.length - 1], 6)))
      .then(listToByDate)
      .then(setWorkoutsByDate)
  }, [])

  // ── Scroll to today on mount ─────────────────────────────────
  useEffect(() => {
    requestAnimationFrame(() => {
      todayRef.current?.scrollIntoView({ block: 'center' })
    })
  }, [])

  // ── Reload after mutations ───────────────────────────────────
  const reload = useCallback(async () => {
    const ws    = weeksRef.current
    const byDate = await api
      .list(toYMD(ws[0]), toYMD(addDays(ws[ws.length - 1], 6)))
      .then(listToByDate)
    setWorkoutsByDate(byDate)
  }, [])

  useEffect(() => { if (reloadRef) reloadRef.current = reload }, [reloadRef, reload])

  // ── Jump-to-today ────────────────────────────────────────────
  useEffect(() => {
    if (scrollToTodayRef)
      scrollToTodayRef.current = () =>
        todayRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [scrollToTodayRef])

  // ── Scroll-position restoration after prepend ────────────────
  // Must run synchronously before paint so there's no visible jump.
  useLayoutEffect(() => {
    if (prevScrollHeightRef.current !== null && scrollRef.current) {
      scrollRef.current.scrollTop +=
        scrollRef.current.scrollHeight - prevScrollHeightRef.current
      prevScrollHeightRef.current = null
    }
  }, [weeks])

  // ── Load more weeks ──────────────────────────────────────────
  const loadMore = useCallback(async (direction) => {
    if (loadingRef.current) return
    loadingRef.current = true
    try {
      const ws       = weeksRef.current
      const newWeeks = direction === 'up'
        ? Array.from({ length: BATCH }, (_, i) => addWeeks(ws[0], i - BATCH))
        : Array.from({ length: BATCH }, (_, i) => addWeeks(ws[ws.length - 1], i + 1))

      const byDate = await api
        .list(toYMD(newWeeks[0]), toYMD(addDays(newWeeks[newWeeks.length - 1], 6)))
        .then(listToByDate)

      if (direction === 'up') {
        // Snapshot height before React updates the DOM so useLayoutEffect can
        // compute the exact delta to add to scrollTop.
        prevScrollHeightRef.current = scrollRef.current.scrollHeight
      }

      // React 18 batches both state updates into one commit.
      setWorkoutsByDate(prev => ({ ...prev, ...byDate }))
      setWeeks(prev =>
        direction === 'up' ? [...newWeeks, ...prev] : [...prev, ...newWeeks]
      )
    } finally {
      loadingRef.current = false
    }
  }, [])

  // ── IntersectionObserver ─────────────────────────────────────
  // Recreated whenever `weeks` changes so the observer always watches the
  // current sentinel elements and correct root.
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
  }, [weeks, loadMore])

  return (
    <div className="calendar">
      <div className="calendar-day-names">
        {DAY_NAMES.map(name => (
          <div key={name} className="day-name">{name}</div>
        ))}
        <div className="day-name day-name--summary"></div>
      </div>

      <div className="calendar-body" ref={scrollRef}>
        <div ref={topSentinelRef} className="scroll-sentinel" />

        {weeks.map((monday) => {
          const key = toYMD(monday)
          return (
            <div key={key} ref={key === currentMondayYMD ? todayRef : null}>
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

        <div ref={bottomSentinelRef} className="scroll-sentinel" />
      </div>
    </div>
  )
}

function listToByDate(list) {
  const byDate = {}
  for (const w of list) {
    if (!byDate[w.date]) byDate[w.date] = []
    byDate[w.date].push(w)
  }
  return byDate
}
