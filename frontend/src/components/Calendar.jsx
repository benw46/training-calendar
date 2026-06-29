import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import WeekRow from './WeekRow'
import { getMondayOf, addWeeks, addDays, toYMD } from '../utils/dates'
import { api } from '../api/workouts'

const DAY_NAMES    = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const BATCH        = 4
const WEEKS_BEFORE = 6
const WEEKS_AFTER  = 3
const ROOT_MARGIN  = '150px'

export default function Calendar({
  onDayClick, onCardClick, onMenuClick,
  reloadRef, scrollToTodayRef, jumpToDateRef, onYearChange,
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

  const scrollRef          = useRef(null)
  const topSentinelRef     = useRef(null)
  const bottomSentinelRef  = useRef(null)
  const weeksRef           = useRef(weeks)
  const prevScrollHeightRef = useRef(null)
  const loadingRef         = useRef(false)
  const todayRef           = useRef(null)
  const weekDivRefs        = useRef(new Map())   // YMD → DOM element
  const pendingScrollYMD   = useRef(null)        // target week after a year jump

  useEffect(() => { weeksRef.current = weeks }, [weeks])

  // ── Initial data load ────────────────────────────────────────
  useEffect(() => {
    const ws = weeksRef.current
    api.list(toYMD(ws[0]), toYMD(addDays(ws[ws.length - 1], 6)))
      .then(listToByDate).then(setWorkoutsByDate)
  }, [])

  // ── Scroll to today on mount ─────────────────────────────────
  useEffect(() => {
    requestAnimationFrame(() => {
      todayRef.current?.scrollIntoView({ block: 'center' })
    })
  }, [])

  // ── Track visible year via scroll ────────────────────────────
  useEffect(() => {
    const el = scrollRef.current
    if (!el || weeks.length === 0) return

    function update() {
      const avgH = el.scrollHeight / weeks.length
      const idx  = Math.max(0, Math.min(Math.floor(el.scrollTop / avgH), weeks.length - 1))
      onYearChange?.(weeks[idx].getFullYear())
    }

    update()
    el.addEventListener('scroll', update, { passive: true })
    return () => el.removeEventListener('scroll', update)
  }, [weeks, onYearChange])

  // ── Reload after mutations ───────────────────────────────────
  const reload = useCallback(async () => {
    const ws = weeksRef.current
    const byDate = await api
      .list(toYMD(ws[0]), toYMD(addDays(ws[ws.length - 1], 6)))
      .then(listToByDate)
    setWorkoutsByDate(byDate)
  }, [])

  useEffect(() => { if (reloadRef) reloadRef.current = reload }, [reloadRef, reload])

  // ── Jump to today ────────────────────────────────────────────
  // todayRef.current is null when today's week has been scrolled out of the
  // rendered set (e.g. after a year jump). Fall back to jumpToDate in that case.
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

  // ── Jump to an arbitrary date (year nav) ─────────────────────
  const jumpToDate = useCallback(async (targetDate) => {
    const targetMonday = getMondayOf(targetDate)
    const targetYMD    = toYMD(targetMonday)

    const newWeeks = Array.from(
      { length: WEEKS_BEFORE + 1 + WEEKS_AFTER },
      (_, i) => addWeeks(targetMonday, i - WEEKS_BEFORE)
    )

    const byDate = await api
      .list(toYMD(newWeeks[0]), toYMD(addDays(newWeeks[newWeeks.length - 1], 6)))
      .then(listToByDate)

    prevScrollHeightRef.current = null  // cancel any pending prepend restoration
    pendingScrollYMD.current    = targetYMD
    setWorkoutsByDate(byDate)
    setWeeks(newWeeks)
  }, [])

  useEffect(() => {
    if (jumpToDateRef) jumpToDateRef.current = jumpToDate
  }, [jumpToDateRef, jumpToDate])

  // ── Layout effects after weeks change ────────────────────────
  useLayoutEffect(() => {
    // 1. Restore scroll position after infinite-scroll prepend
    if (prevScrollHeightRef.current !== null && scrollRef.current) {
      scrollRef.current.scrollTop +=
        scrollRef.current.scrollHeight - prevScrollHeightRef.current
      prevScrollHeightRef.current = null
    }

    // 2. Scroll to target week after a year jump
    if (pendingScrollYMD.current) {
      const el = weekDivRefs.current.get(pendingScrollYMD.current)
      if (el) {
        el.scrollIntoView({ block: 'start' })
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

      const byDate = await api
        .list(toYMD(newWeeks[0]), toYMD(addDays(newWeeks[newWeeks.length - 1], 6)))
        .then(listToByDate)

      if (direction === 'up')
        prevScrollHeightRef.current = scrollRef.current.scrollHeight

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
