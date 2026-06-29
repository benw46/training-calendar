import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import WeekRow from './WeekRow'
import { getMondayOf, addWeeks, addDays, toYMD } from '../utils/dates'
import { api } from '../api/workouts'

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const BATCH = 4       // weeks to add per load
const ROOT_MARGIN = '300px'

export default function Calendar({ onDayClick, onCardClick, onMenuClick, reloadRef }) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const currentMonday = getMondayOf(today)
  const currentMondayYMD = toYMD(currentMonday)

  // Start with 4 weeks before + current + 3 after so initial scrollTop is
  // comfortably above rootMargin, preventing a spurious upward load on mount.
  const [weeks, setWeeks] = useState(() =>
    Array.from({ length: 8 }, (_, i) => addWeeks(currentMonday, i - 4))
  )
  const [workoutsByDate, setWorkoutsByDate] = useState({})

  const scrollRef        = useRef(null)
  const topSentinelRef   = useRef(null)
  const bottomSentinelRef = useRef(null)
  const weeksRef         = useRef(weeks)
  const prevScrollHeightRef = useRef(null)   // set before prepend, cleared after restore
  const loadingRef       = useRef(false)
  const scrollReadyRef   = useRef(false)     // blocks IO callbacks until initial scroll done
  const todayRef         = useRef(null)

  useEffect(() => { weeksRef.current = weeks }, [weeks])

  // ── Initial data load ────────────────────────────────────────
  useEffect(() => {
    const ws = weeksRef.current
    const start = toYMD(ws[0])
    const end   = toYMD(addDays(ws[ws.length - 1], 6))
    api.list(start, end).then(listToByDate).then(setWorkoutsByDate)
  }, []) // once on mount

  // ── Scroll to today, then enable infinite scroll ─────────────
  useEffect(() => {
    requestAnimationFrame(() => {
      todayRef.current?.scrollIntoView({ block: 'center' })
      // Second rAF: IO callbacks for pre-scroll position have fired by now;
      // enabling the flag means future IO callbacks are real user scrolls.
      requestAnimationFrame(() => { scrollReadyRef.current = true })
    })
  }, [])

  // ── Reload after mutations ───────────────────────────────────
  const reload = useCallback(async () => {
    const ws = weeksRef.current
    const start = toYMD(ws[0])
    const end   = toYMD(addDays(ws[ws.length - 1], 6))
    const byDate = await api.list(start, end).then(listToByDate)
    setWorkoutsByDate(byDate)
  }, [])

  useEffect(() => {
    if (reloadRef) reloadRef.current = reload
  }, [reloadRef, reload])

  // ── Scroll restoration after prepend (must be synchronous) ───
  useLayoutEffect(() => {
    if (prevScrollHeightRef.current !== null && scrollRef.current) {
      scrollRef.current.scrollTop +=
        scrollRef.current.scrollHeight - prevScrollHeightRef.current
      prevScrollHeightRef.current = null
    }
  }, [weeks])

  // ── Load more weeks ──────────────────────────────────────────
  const loadMore = useCallback(async (direction) => {
    if (loadingRef.current || !scrollReadyRef.current) return
    loadingRef.current = true
    try {
      const ws = weeksRef.current
      const newWeeks = direction === 'up'
        ? Array.from({ length: BATCH }, (_, i) => addWeeks(ws[0], i - BATCH))
        : Array.from({ length: BATCH }, (_, i) => addWeeks(ws[ws.length - 1], i + 1))

      const start = toYMD(newWeeks[0])
      const end   = toYMD(addDays(newWeeks[newWeeks.length - 1], 6))
      const byDate = await api.list(start, end).then(listToByDate)

      if (direction === 'up') {
        // Capture height before React mutates the DOM
        prevScrollHeightRef.current = scrollRef.current.scrollHeight
      }

      // React 18 batches these two setState calls
      setWorkoutsByDate(prev => ({ ...prev, ...byDate }))
      setWeeks(prev =>
        direction === 'up' ? [...newWeeks, ...prev] : [...prev, ...newWeeks]
      )
    } finally {
      loadingRef.current = false
    }
  }, [])

  // ── IntersectionObserver ─────────────────────────────────────
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

// ── Helpers ──────────────────────────────────────────────────
function listToByDate(list) {
  const byDate = {}
  for (const w of list) {
    if (!byDate[w.date]) byDate[w.date] = []
    byDate[w.date].push(w)
  }
  return byDate
}
