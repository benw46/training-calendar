import { useRef, useState, useCallback, useEffect, useMemo, useLayoutEffect } from 'react'
import Calendar from './components/Calendar'
import ColorLegend from './components/ColorLegend'
import EventBanner from './components/EventBanner'
import GraphsModal from './components/GraphsModal'
import Login from './components/Login'
import WorkoutModal from './components/WorkoutModal'
import { api } from './api/workouts'
import { formatSyncedAt } from './utils/dates'
import { supabase } from './supabaseClient'

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']

export default function App() {
  // undefined = still checking for an existing session; null = signed out
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  const reloadRef        = useRef(null)
  const scrollToTodayRef = useRef(null)
  const jumpToDateRef    = useRef(null)

  const [modal, setModal]               = useState(null)
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState(null)
  const [lastSynced, setLastSynced] = useState(null)
  const [nextEvents, setNextEvents] = useState([])
  const [showGraphs, setShowGraphs] = useState(false)

  // The header's gradient is centered on the event banner's actual position
  // (measured live) rather than a hardcoded percentage, since the banner
  // doesn't sit at a fixed spot — its distance from the left edge depends on
  // the title's width on one side and however many controls render on the
  // other.
  const headerRef = useRef(null)
  const bannerWrapRef = useRef(null)
  const [gradientCenterPct, setGradientCenterPct] = useState(50)

  const monthLabel = `${MONTH_NAMES[visibleMonth.getMonth()]} ${visibleMonth.getFullYear()}`

  // Memoized so the array reference only changes when the fetched events
  // actually change — EventBanner's ticker interval keys off this reference
  // and would restart every render (never advancing) if it were rebuilt
  // fresh each time.
  const eventBannerLines = useMemo(() => {
    if (nextEvents.length === 0) return ['No Event Planned']
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return nextEvents.map(ev => {
      const daysUntil = Math.round((new Date(ev.date + 'T00:00:00') - today) / 86400000)
      return daysUntil === 0 ? `${ev.name} today` : `${daysUntil} days until ${ev.name}`
    })
  }, [nextEvents])

  // The header's gradient is centered on the event banner's actual position
  // (measured live) rather than a hardcoded percentage, since the banner
  // doesn't sit at a fixed spot — its distance from the left edge depends on
  // the title's width on one side and however many controls render on the
  // other.
  useLayoutEffect(() => {
    const headerEl = headerRef.current
    const bannerEl = bannerWrapRef.current
    if (!headerEl || !bannerEl) return

    function updateCenter() {
      const headerRect = headerEl.getBoundingClientRect()
      const bannerRect = bannerEl.getBoundingClientRect()
      if (headerRect.width === 0) return
      const bannerCenterX = bannerRect.left + bannerRect.width / 2 - headerRect.left
      setGradientCenterPct((bannerCenterX / headerRect.width) * 100)
    }

    updateCenter()
    const ro = new ResizeObserver(updateCenter)
    ro.observe(headerEl)
    ro.observe(bannerEl)
    return () => ro.disconnect()
  }, [eventBannerLines])

  // A sync may have happened in a previous session, so read the persisted
  // timestamp on mount rather than only tracking it after a sync in this one.
  // Gated on `session` (and re-run when it changes) since this component's
  // hooks all run before the login gate below — on first mount `session` is
  // still `undefined` (auth hasn't resolved yet), so an unguarded one-shot
  // effect here would 401 against the backend and never retry once actually
  // signed in.
  useEffect(() => {
    if (!session) return
    api.getLastSync().then(r => setLastSynced(r.last_synced_at)).catch(() => {})
  }, [session])

  const refreshNextEvents = useCallback(() => {
    api.getNextEvents(3).then(setNextEvents).catch(() => {})
  }, [])

  useEffect(() => {
    if (!session) return
    refreshNextEvents()
  }, [session, refreshNextEvents])

  async function handleGarminSync() {
    setSyncing(true)
    setSyncMsg(null)
    try {
      const result = await api.syncGarmin()
      setSyncMsg(`${result.unmatched} new activit${result.unmatched === 1 ? 'y' : 'ies'} added, ${result.synced} matched to plans`)
      setLastSynced(result.last_synced_at)
      reloadRef.current?.()
      refreshNextEvents()
    } catch (err) {
      setSyncMsg(`Sync failed — ${err.message}`)
    } finally {
      setSyncing(false)
      setTimeout(() => setSyncMsg(null), 5000)
    }
  }

  function handleDayClick(date)     { setModal({ type: 'add', date }) }
  function handleCardClick(workout) { setModal({ type: 'edit', workout }) }
  function handleMenuClick(workout) { setModal({ type: 'edit', workout }) }
  function handleSaved()   { setModal(null); reloadRef.current?.(); refreshNextEvents() }
  function handleDeleted() { setModal(null); reloadRef.current?.(); refreshNextEvents() }

  const handleMonthChange = useCallback((date) => {
    setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1))
  }, [])

  function handlePrevMonth() {
    const d = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1)
    setVisibleMonth(d)
    jumpToDateRef.current?.(d)
  }
  function handleNextMonth() {
    const d = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1)
    setVisibleMonth(d)
    jumpToDateRef.current?.(d)
  }

  // Hooks above this point must always run regardless of auth state, so the
  // login gate happens here rather than as an early return at the top.
  if (session === undefined) return null
  if (session === null) return <Login />

  return (
    <div className="app">
      <header
        className="app-header"
        ref={headerRef}
        style={{
          background: `linear-gradient(90deg, #334155 0%, #1e3a8a ${gradientCenterPct}%, #334155 100%)`,
        }}
      >
        <span className="app-header__title">
          <span className="app-header__brand">Race Condition</span>
          <span className="app-header__subtitle">The Vibe Coded Workout Scheduler</span>
        </span>

        <EventBanner lines={eventBannerLines} wrapRef={bannerWrapRef} />

        <div className="app-header__controls">
          <button
            className="app-header__graphs-btn"
            onClick={() => setShowGraphs(true)}
          >
            Graphs
          </button>

          <div className="month-nav">
            <button className="month-nav__btn" onClick={handlePrevMonth} aria-label="Previous month">
              &lsaquo;
            </button>
            <span className="month-nav__label">{monthLabel}</span>
            <button className="month-nav__btn" onClick={handleNextMonth} aria-label="Next month">
              &rsaquo;
            </button>
          </div>

          <button
            className="app-header__today-btn"
            onClick={() => scrollToTodayRef.current?.()}
          >
            Today
          </button>

          <button
            className="app-header__sync-btn"
            onClick={handleGarminSync}
            disabled={syncing}
          >
            {syncing ? 'Syncing…' : 'Sync from Garmin'}
          </button>

          <span className="app-header__last-synced">
            {lastSynced ? `Last synced: ${formatSyncedAt(lastSynced)}` : 'Not yet synced'}
          </span>

          <ColorLegend />

          <button
            className="app-header__signout-btn"
            onClick={() => supabase.auth.signOut()}
          >
            Sign out
          </button>
        </div>
      </header>

      {syncMsg && <div className="sync-toast">{syncMsg}</div>}

      <Calendar
        reloadRef={reloadRef}
        scrollToTodayRef={scrollToTodayRef}
        jumpToDateRef={jumpToDateRef}
        onMonthChange={handleMonthChange}
        onDayClick={handleDayClick}
        onCardClick={handleCardClick}
        onMenuClick={handleMenuClick}
        onWorkoutsChanged={refreshNextEvents}
      />

      {modal && (
        <WorkoutModal
          workout={modal.type === 'edit' ? modal.workout : null}
          initialDate={modal.type === 'add' ? modal.date : null}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      )}

      {showGraphs && <GraphsModal onClose={() => setShowGraphs(false)} />}
    </div>
  )
}
