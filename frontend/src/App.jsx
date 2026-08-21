import { useRef, useState, useCallback, useEffect } from 'react'
import Calendar from './components/Calendar'
import ColorLegend from './components/ColorLegend'
import GraphsModal from './components/GraphsModal'
import Login from './components/Login'
import MobileDayView from './components/MobileDayView'
import RaceCalendarModal from './components/RaceCalendarModal'
import WorkoutModal from './components/WorkoutModal'
import { api } from './api/workouts'
import { formatSyncedAt, MIN_YEAR, MAX_YEAR, MIN_DATE, MAX_DATE } from './utils/dates'
import { supabase } from './supabaseClient'

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']

// A sync no longer runs inside the API call — the request just wakes the Pi,
// which does the fetch and writes a fresh last_synced_at. So after requesting,
// poll last-sync until that timestamp *changes* from what it was before (a
// self-relative check, so it's immune to clock skew between Render and the Pi).
// Returns the new last-sync payload, or null if it never landed (Pi offline).
async function pollForSync(before, { timeoutMs = 90000, intervalMs = 1500 } = {}) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, intervalMs))
    let r
    try {
      r = await api.getLastSync()
    } catch {
      continue // transient error mid-poll — keep trying until the timeout
    }
    if (r?.last_synced_at && r.last_synced_at !== before) return r
  }
  return null
}

// Below this width the 7-day desktop grid can't just shrink to fit — it
// needs an entirely different layout, so the switch happens in JS (which
// component tree mounts) rather than via CSS alone.
const MOBILE_BREAKPOINT = 700

// The two header divider bars (end of .app-header__controls, start of
// .app-header__end) are meant to merge into one flush line once
// .app-header__end has no room left to right-hug into. Relying on the CSS
// auto-margin to coincidentally land on exactly 0 is too fragile — it's at
// the mercy of the current last-synced string and .app-header__end's own
// 200px minmax floor, either of which can leave a several-px sliver that
// never quite closes. Measuring
// the real slack and snapping it to 0 below a small threshold guarantees a
// clean binary "clearly separate" or "fully merged" instead of a state
// that's neither.
const HEADER_DIVIDER_SLACK_THRESHOLD = 8

function useHeaderEndSlack() {
  // Plain element refs (read inside recompute/attach below) rather than the
  // objects returned to callers — callers get the *callback* versions
  // further down instead.
  const controlsElRef = useRef(null)
  const endElRef = useRef(null)
  const observerRef = useRef(null)
  const [hasSlack, setHasSlack] = useState(true)

  // clientWidth vs scrollWidth doesn't work here: the first child's
  // margin-left: auto absorbs free space rather than overflowing, so
  // scrollWidth just tracks clientWidth right back down and never reveals
  // how much slack there actually was. Summing each child's own offsetWidth
  // (unaffected by its own margin) plus the flex gaps gives the box's true
  // content width independent of however much margin is currently applied —
  // which also keeps this reversible, since it doesn't get stuck reading
  // "no slack" just because a previous measurement forced the margin to 0.
  const recompute = useCallback(() => {
    const controlsEl = controlsElRef.current
    const endEl = endElRef.current
    if (!controlsEl || !endEl) return

    const kids = Array.from(endEl.children)
    const gap = parseFloat(getComputedStyle(endEl).columnGap) || 0
    const contentWidth = kids.reduce((sum, k) => sum + k.offsetWidth, 0) + gap * (kids.length - 1)
    const slack = endEl.clientWidth - contentWidth
    setHasSlack(slack > HEADER_DIVIDER_SLACK_THRESHOLD)
  }, [])

  // (Re)creates the observer once both elements are attached. Called from
  // each ref callback below rather than from a useEffect keyed on isMobile:
  // the mobile/desktop headers are gated behind the async session check in
  // App(), so on first load the desktop header doesn't exist in the DOM yet
  // when App first mounts — an effect keyed on isMobile alone would fire
  // once against null refs (and set up nothing) and then never fire again,
  // since isMobile itself doesn't change once the session resolves and the
  // real header mounts. Ref callbacks instead re-fire exactly when the DOM
  // nodes themselves change, for whatever reason.
  const attach = useCallback(() => {
    observerRef.current?.disconnect()
    observerRef.current = null
    const controlsEl = controlsElRef.current
    const endEl = endElRef.current
    if (!controlsEl || !endEl) return

    // Observes both: endEl's own box changes with window/grid resizes,
    // while controlsEl's box changes with its own "auto" grid track sizing
    // to content — either can change how much slack endEl has left.
    const observer = new ResizeObserver(recompute)
    observer.observe(controlsEl)
    observer.observe(endEl)
    observerRef.current = observer
    recompute()
  }, [recompute])

  const controlsRef = useCallback(node => { controlsElRef.current = node; attach() }, [attach])
  const endRef = useCallback(node => { endElRef.current = node; attach() }, [attach])

  useEffect(() => () => observerRef.current?.disconnect(), [])

  return { controlsRef, endRef, hasSlack }
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= MOBILE_BREAKPOINT
  )

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`)
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  return isMobile
}

export default function App() {
  const isMobile = useIsMobile()
  const { controlsRef, endRef, hasSlack } = useHeaderEndSlack()

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
  const [piOnline, setPiOnline] = useState(null)  // null = not yet checked
  const [showGraphs, setShowGraphs] = useState(false)
  const [showRaceCalendar, setShowRaceCalendar] = useState(false)

  const monthLabel = `${MONTH_NAMES[visibleMonth.getMonth()]} ${visibleMonth.getFullYear()}`

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

  // Poll the Pi's liveness so the header dot reflects whether on-demand syncing
  // is currently available. 30s is well within the backend's 60s online window,
  // so a Pi going offline surfaces within a poll or two.
  useEffect(() => {
    if (!session) return
    let active = true
    const check = () =>
      api.getPiStatus().then(r => { if (active) setPiOnline(r.pi_online) }).catch(() => {})
    check()
    const id = setInterval(check, 30000)
    return () => { active = false; clearInterval(id) }
  }, [session])

  async function handleGarminSync() {
    setSyncing(true)
    setSyncMsg(null)
    const before = lastSynced
    try {
      await api.syncGarmin()               // wakes the Pi; doesn't fetch itself
      const r = await pollForSync(before)  // wait for the Pi to report a result
      if (r) {
        const { synced = 0, unmatched = 0 } = r.last_result || {}
        setSyncMsg(`${unmatched} new activit${unmatched === 1 ? 'y' : 'ies'} added, ${synced} matched to plans`)
        setLastSynced(r.last_synced_at)
        setPiOnline(true)   // a completed sync proves the Pi is up
        reloadRef.current?.()
      } else {
        setSyncMsg('Sync queued — it will run when your Pi is next online')
        setPiOnline(false)  // nothing came back in time → Pi looks offline
      }
    } catch (err) {
      setSyncMsg(`Sync failed — ${err.message}`)
    } finally {
      setSyncing(false)
      setTimeout(() => setSyncMsg(null), 5000)
    }
  }

  function handleGoToDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00')
    setVisibleMonth(new Date(d.getFullYear(), d.getMonth(), 1))
    jumpToDateRef.current?.(d)
  }

  function handleDayClick(date)     { setModal({ type: 'add', date }) }
  function handleCardClick(workout) { setModal({ type: 'edit', workout }) }
  function handleSaved()   { setModal(null); reloadRef.current?.() }
  function handleDeleted() { setModal(null); reloadRef.current?.() }

  const handleMonthChange = useCallback((date) => {
    setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1))
  }, [])

  function handlePrevMonth() {
    const d = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1)
    if (d < MIN_DATE) return
    setVisibleMonth(d)
    jumpToDateRef.current?.(d)
  }
  function handleNextMonth() {
    const d = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1)
    if (d > MAX_DATE) return
    setVisibleMonth(d)
    jumpToDateRef.current?.(d)
  }

  // Drives disabling the ‹ › month-nav buttons at the same bounds — >=/<=
  // rather than ===, so this stays correct even if visibleMonth somehow
  // ended up past a bound rather than exactly on it.
  const atMinMonth = visibleMonth.getFullYear() <= MIN_YEAR && visibleMonth.getMonth() === 0
  const atMaxMonth = visibleMonth.getFullYear() >= MAX_YEAR && visibleMonth.getMonth() === 11

  // Hooks above this point must always run regardless of auth state, so the
  // login gate happens here rather than as an early return at the top.
  if (session === undefined) return null
  if (session === null) return <Login />

  // Shared between both header layouts below rather than duplicated —
  // identical markup/handlers either way, only its position in the header
  // differs.
  const monthNav = (
    <div className="month-nav">
      <button className="month-nav__btn" onClick={handlePrevMonth} disabled={atMinMonth} aria-label="Previous month">
        &lsaquo;
      </button>
      <span className="month-nav__label">{monthLabel}</span>
      <button className="month-nav__btn" onClick={handleNextMonth} disabled={atMaxMonth} aria-label="Next month">
        &rsaquo;
      </button>
    </div>
  )

  return (
    <div className="app">
      {isMobile ? (
        // A separately-structured header rather than a CSS reflow of the
        // desktop one below: the desktop layout's two groups
        // (.app-header__controls / .app-header__end) each wrap as a unit on
        // narrow screens, which can't produce the specific row-by-row order
        // requested here (month nav, then Today+Graphs, then Race
        // Calendar+Sync, then Sign out) since that interleaves elements from
        // both groups.
        <header className="app-header app-header--mobile">
          {monthNav}

          <div className="app-header__mobile-row">
            <button
              className="app-header__today-btn"
              onClick={() => scrollToTodayRef.current?.()}
            >
              Today
            </button>
            <button
              className="app-header__graphs-btn"
              onClick={() => setShowGraphs(true)}
            >
              Graphs
            </button>
          </div>

          <div className="app-header__mobile-row">
            <button
              className="app-header__race-calendar-btn"
              onClick={() => setShowRaceCalendar(true)}
            >
              Race Calendar
            </button>
            <button
              className="app-header__sync-btn"
              onClick={handleGarminSync}
              disabled={syncing}
            >
              {syncing ? 'Syncing…' : 'Sync from Garmin'}
            </button>
          </div>

          <div className="app-header__mobile-row">
            <button
              className="app-header__signout-btn"
              onClick={() => supabase.auth.signOut()}
            >
              Sign out
            </button>
          </div>

          {/* Absolutely positioned (see .app-header--mobile .color-legend)
              into the top-right corner rather than given its own row —
              there's no row it naturally belongs to, and pinning it out of
              flow keeps the action buttons' row widths (and so their
              matched sizing) unaffected by it. */}
          <ColorLegend piOnline={piOnline} />
        </header>
      ) : (
        <header className="app-header">
          <div className="app-header__controls" ref={controlsRef}>
            <button
              className="app-header__today-btn"
              onClick={() => scrollToTodayRef.current?.()}
            >
              Today
            </button>

            {monthNav}

            <button
              className="app-header__race-calendar-btn"
              onClick={() => setShowRaceCalendar(true)}
            >
              Race Calendar
            </button>
          </div>

          <span className="app-header__divider" aria-hidden="true" />

          {/* Deliberately outside .app-header__controls: that container is
              horizontally scrollable, and ColorLegend's popover would get
              clipped by that container's overflow if it lived inside it.
              Grouped together here so Graphs/Sync/Last-synced/Legend/Sign-out
              always stay on the same line as each other, wrapping as one unit
              rather than being scattered wherever the nav controls happen to
              wrap. */}
          <div
            className={`app-header__end${hasSlack ? '' : ' app-header__end--merged'}`}
            ref={endRef}
          >
            {/* Mirrors the divider above: that one hugs the end of
                .app-header__controls, this one hugs the start of this group
                (via the :first-child margin-left: auto below). When
                .app-header__end has slack, the two show as separate bars
                bracketing the empty space; once useHeaderEndSlack measures
                that slack dropping below its threshold, --merged forces this
                bar flush against the other (column-gap between them is 0 —
                see .app-header CSS) so they read as a single merged line. */}
            <span className="app-header__divider" aria-hidden="true" />

            <button
              className="app-header__graphs-btn"
              onClick={() => setShowGraphs(true)}
            >
              Graphs
            </button>

            <button
              className="app-header__sync-btn"
              onClick={handleGarminSync}
              disabled={syncing}
            >
              {syncing ? 'Syncing…' : 'Sync from Garmin'}
            </button>

            <span className="app-header__last-synced">
              {lastSynced ? (
                <>
                  <span className="app-header__last-synced-label">Last synced: </span>
                  {formatSyncedAt(lastSynced)}
                </>
              ) : 'Not yet synced'}
            </span>

            <ColorLegend piOnline={piOnline} />

            <button
              className="app-header__signout-btn"
              onClick={() => supabase.auth.signOut()}
            >
              Sign out
            </button>
          </div>
        </header>
      )}

      {syncMsg && <div className="sync-toast">{syncMsg}</div>}

      {isMobile ? (
        <MobileDayView
          reloadRef={reloadRef}
          scrollToTodayRef={scrollToTodayRef}
          jumpToDateRef={jumpToDateRef}
          onMonthChange={handleMonthChange}
          onDayClick={handleDayClick}
          onCardClick={handleCardClick}
        />
      ) : (
        <Calendar
          reloadRef={reloadRef}
          scrollToTodayRef={scrollToTodayRef}
          jumpToDateRef={jumpToDateRef}
          onMonthChange={handleMonthChange}
          onDayClick={handleDayClick}
          onCardClick={handleCardClick}
        />
      )}

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

      {showRaceCalendar && (
        <RaceCalendarModal
          onClose={() => setShowRaceCalendar(false)}
          onWorkoutsChanged={() => reloadRef.current?.()}
          onGoToDate={handleGoToDate}
        />
      )}
    </div>
  )
}
