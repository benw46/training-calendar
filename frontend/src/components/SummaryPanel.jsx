import { useState, useEffect } from 'react'
import { toYMD, addDays, getMondayOf } from '../utils/dates'
import { SPORT_COLORS, fmtDuration, sortDayWorkouts } from '../utils/workouts'
import {
  weekActualTotal, weekPlannedTotal,
  weekActualTotalsBySport, weekPlannedTotalsBySport,
  computeDelta,
} from '../utils/weeklyTotals'
import { api } from '../api/workouts'

const ROWS = [
  { key: 'total', label: 'Total', color: '#374151' },
  { key: 'swim',  label: 'Swim',  color: SPORT_COLORS.swim },
  { key: 'bike',  label: 'Bike',  color: SPORT_COLORS.bike },
  { key: 'run',   label: 'Run',   color: SPORT_COLORS.run },
  { key: 'gym',   label: 'Gym',   color: SPORT_COLORS.strength },
  { key: 'other', label: 'Other', color: SPORT_COLORS.other },
]

const SPORT_ROWS = ROWS.filter(r => r.key !== 'total')

// Copy Week / Delete Week only touch physical training activities — Note,
// Event, and Period cards are markers/annotations rather than something to
// duplicate or bulk-delete a week's worth of.
const PHYSICAL_SPORTS = new Set(['swim', 'bike', 'run', 'strength', 'other'])

function deltaText(delta) {
  if (delta.kind === 'new')  return 'New'
  if (delta.kind === 'up')   return `▲ +${delta.pct}%`
  if (delta.kind === 'down') return `▼ ${delta.pct}%`
  return `– ${delta.pct}%`
}

// 'down' is split into two colors by severity: -1% to -25% is a mild dip
// (yellow), -26% or worse is a serious drop-off (red).
function deltaClassSuffix(delta) {
  if (delta.kind !== 'down') return delta.kind
  return delta.pct <= -26 ? 'down-severe' : 'down-mild'
}

function DeltaBadge({ delta, sportDeltas, explanation }) {
  return (
    <span className="summary-delta" tabIndex={0}>
      <span className={`summary-delta-badge summary-delta-badge--${deltaClassSuffix(delta)}`}>
        {deltaText(delta)}
      </span>
      <div className="summary-delta-popover">
        <div className="summary-delta-popover__explanation">{explanation}</div>
        <div className="summary-delta-popover__title">Delta by sport</div>
        {sportDeltas.map(sd => (
          <div key={sd.key} className="summary-delta-popover__row">
            <span className="summary-delta-popover__dot" style={{ background: sd.color }} />
            <span className="summary-delta-popover__label">{sd.label}</span>
            <span className={`summary-delta-badge summary-delta-badge--${deltaClassSuffix(sd.delta)}`}>
              {deltaText(sd.delta)}
            </span>
          </div>
        ))}
      </div>
    </span>
  )
}

export default function SummaryPanel({ workoutsByDate, days, today, onReordered }) {
  const [copyState, setCopyState] = useState('idle') // 'idle' | 'copying' | 'done' | 'error'
  const [copyMsg, setCopyMsg]     = useState(null)
  const [deleteState, setDeleteState] = useState('idle') // 'idle' | 'deleting' | 'error'
  const [deleteMsg, setDeleteMsg]     = useState(null)
  const [actionsOpen, setActionsOpen] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  useEffect(() => {
    if (!confirmingDelete) return
    function onKey(e) { if (e.key === 'Escape') setConfirmingDelete(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [confirmingDelete])

  const workouts = days.flatMap(d => workoutsByDate[toYMD(d)] ?? [])
  const physicalWorkouts = workouts.filter(w => PHYSICAL_SPORTS.has(w.sport))

  // Duplicates every card in the visible week onto the same weekday next
  // week — the plan, not the outcome: actual_duration/distance and the
  // Garmin link are deliberately left off since next week hasn't happened
  // yet and copying "what happened" onto an unrun day would be misleading.
  async function handleCopyWeek() {
    if (physicalWorkouts.length === 0 || copyState === 'copying') return
    setCopyState('copying')
    setCopyMsg(null)

    // Each day's cards are copied in on-screen order (not raw API/id order,
    // which can trail behind a drag-reorder) and created one at a time
    // rather than in parallel — the new day starts with every sort_order
    // null, so its display order falls back to insertion order (see
    // sortDayWorkouts), and concurrent requests would let the server
    // assign ids in whatever order they happened to land, silently
    // reshuffling the copy (breaking brick pairs, which are inferred from
    // adjacency, not stored links). Event/Period/Note cards are filtered out
    // after sorting so remaining physical cards keep their relative order.
    const ordered = days
      .flatMap(d => sortDayWorkouts(workoutsByDate[toYMD(d)] ?? []))
      .filter(w => PHYSICAL_SPORTS.has(w.sport))
    let failed = 0
    for (const w of ordered) {
      try {
        await api.create({
          date: toYMD(addDays(new Date(w.date + 'T00:00:00'), 7)),
          sport: w.sport,
          name: w.name,
          planned_duration_minutes: w.planned_duration_minutes,
          planned_distance_km: w.planned_distance_km,
          description: w.description,
          is_brick: w.is_brick,
          gym_exercises: w.gym_exercises,
        })
      } catch {
        failed += 1
      }
    }

    if (failed < ordered.length) onReordered?.()

    if (failed > 0) {
      setCopyState('error')
      setCopyMsg(`${failed} of ${ordered.length} didn't copy`)
    } else {
      setCopyState('done')
      setCopyMsg('Copied!')
    }
    setTimeout(() => { setCopyState('idle'); setCopyMsg(null) }, 4000)
  }

  function handleDeleteWeek() {
    if (physicalWorkouts.length === 0 || deleteState === 'deleting') return
    setConfirmingDelete(true)
  }

  async function confirmDeleteWeek() {
    setConfirmingDelete(false)
    setDeleteState('deleting')
    setDeleteMsg(null)

    const results = await Promise.allSettled(physicalWorkouts.map(w => api.delete(w.id)))
    const failed = results.filter(r => r.status === 'rejected')

    if (failed.length < physicalWorkouts.length) onReordered?.()

    if (failed.length > 0) {
      setDeleteState('error')
      setDeleteMsg(`${failed.length} of ${physicalWorkouts.length} didn't delete`)
      setTimeout(() => { setDeleteState('idle'); setDeleteMsg(null) }, 4000)
    } else {
      setDeleteState('idle')
    }
  }

  const actualByKey  = { total: 0, swim: 0, bike: 0, run: 0, gym: 0, other: 0 }
  const plannedByKey = { total: 0, swim: 0, bike: 0, run: 0, gym: 0, other: 0 }
  for (const w of workouts) {
    const actual  = w.actual_duration_minutes ?? 0
    const planned = w.planned_duration_minutes ?? 0
    actualByKey.total  += actual
    plannedByKey.total += planned

    const bucket = w.sport === 'swim' || w.sport === 'bike' || w.sport === 'run'
      ? w.sport
      : w.sport === 'strength' ? 'gym' : 'other'
    actualByKey[bucket]  += actual
    plannedByKey[bucket] += planned
  }

  // The delta bar's formula depends on where this week sits relative to
  // today: a past week is fully known, so it's judged on what actually
  // happened; the current week is still in flight, so its plan is judged
  // against last week's real result; a future week has no actual data yet
  // for either side, so it's plan-vs-plan.
  const prevMonday  = addDays(days[0], -7)
  const weekYMD     = toYMD(days[0])
  const todayWeekYMD = toYMD(getMondayOf(today))
  const isPast    = weekYMD < todayWeekYMD
  const isCurrent = weekYMD === todayWeekYMD

  let deltaLabel, deltaExplanation, currentSide, previousSide, previousBySport
  if (isPast) {
    deltaLabel       = 'Actual Delta:'
    deltaExplanation = "This week's actual duration vs. last week's actual duration achieved."
    currentSide      = actualByKey
    previousSide     = weekActualTotal(workoutsByDate, prevMonday)
    previousBySport  = weekActualTotalsBySport(workoutsByDate, prevMonday)
  } else if (isCurrent) {
    deltaLabel       = 'Delta to last week:'
    deltaExplanation = "This week's planned duration vs. last week's actual duration achieved."
    currentSide      = plannedByKey
    previousSide     = weekActualTotal(workoutsByDate, prevMonday)
    previousBySport  = weekActualTotalsBySport(workoutsByDate, prevMonday)
  } else {
    deltaLabel       = 'Delta to last week:'
    deltaExplanation = "This week's planned duration vs. last week's planned duration."
    currentSide      = plannedByKey
    previousSide     = weekPlannedTotal(workoutsByDate, prevMonday)
    previousBySport  = weekPlannedTotalsBySport(workoutsByDate, prevMonday)
  }

  const totalDelta = computeDelta(currentSide.total, previousSide)
  const sportDeltas = SPORT_ROWS.map(({ key, label, color }) => ({
    key, label, color,
    delta: computeDelta(currentSide[key], previousBySport[key]),
  }))

  return (
    <div className="summary-panel">
      {ROWS.map(({ key, label, color }) => {
        const planned = plannedByKey[key]
        const pct = planned > 0 ? Math.min(actualByKey[key] / planned, 1) : 0
        return (
          <div key={key} className="summary-row-group">
            {key === 'total' && (
              <div className="summary-delta-bar">
                <div className="summary-week-actions">
                  <button
                    type="button"
                    className="summary-week-actions-toggle"
                    onClick={() => setActionsOpen(v => !v)}
                    aria-expanded={actionsOpen}
                    aria-label={actionsOpen ? 'Hide week actions' : 'Show week actions'}
                    title={actionsOpen ? 'Hide week actions' : 'Show week actions'}
                  >
                    <svg viewBox="0 0 16 4" width="16" height="4" aria-hidden="true">
                      <circle cx="2" cy="2" r="1.6" fill="currentColor" />
                      <circle cx="8" cy="2" r="1.6" fill="currentColor" />
                      <circle cx="14" cy="2" r="1.6" fill="currentColor" />
                    </svg>
                  </button>
                  {actionsOpen && (
                    <>
                      <button
                        type="button"
                        className="summary-copy-week-btn"
                        onClick={handleCopyWeek}
                        disabled={copyState === 'copying' || physicalWorkouts.length === 0}
                        title="Copy this week's activities to the same days next week"
                      >
                        {copyState === 'copying' ? 'Copying…' : 'Copy Week'}
                      </button>
                      <button
                        type="button"
                        className="summary-delete-week-btn"
                        onClick={handleDeleteWeek}
                        disabled={deleteState === 'deleting' || physicalWorkouts.length === 0}
                        title="Delete all activities in this week"
                      >
                        {deleteState === 'deleting' ? 'Deleting…' : 'Delete Week'}
                      </button>
                    </>
                  )}
                </div>
                <div className="summary-delta-row">
                  <span className="summary-delta-bar__label">{deltaLabel}</span>
                  <DeltaBadge
                    delta={totalDelta}
                    sportDeltas={sportDeltas}
                    explanation={deltaExplanation}
                  />
                </div>
                {copyMsg && (
                  <span className={`summary-week-action-msg summary-week-action-msg--${copyState}`}>
                    {copyMsg}
                  </span>
                )}
                {deleteMsg && (
                  <span className={`summary-week-action-msg summary-week-action-msg--${deleteState}`}>
                    {deleteMsg}
                  </span>
                )}
              </div>
            )}
            <div className={`summary-row${key === 'total' ? ' summary-row--total' : ''}`}>
              <span className="summary-row__dot" style={{ background: color }} />
              <span className="summary-row__label">{label}</span>
              <span className="summary-row__planned-value">{fmtDuration(plannedByKey[key])}h</span>
              <span className="summary-row__value">{fmtDuration(actualByKey[key])}h</span>
            </div>
            {key === 'total'
              ? <div className="summary-row--total__divider" />
              : (
                <div className="summary-row__progress">
                  <div
                    className="summary-row__progress-fill"
                    style={{ width: `${pct * 100}%`, background: color }}
                  />
                </div>
              )}
          </div>
        )
      })}
      {confirmingDelete && (
        <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setConfirmingDelete(false) }}>
          <div className="modal modal--confirm" role="alertdialog" aria-modal="true">
            <div className="modal-header">
              <h2 className="modal-title">Delete Week</h2>
              <button className="modal-close" onClick={() => setConfirmingDelete(false)} aria-label="Close">✕</button>
            </div>
            <div className="modal-confirm-body">
              <p>
                Delete all {physicalWorkouts.length} activit{physicalWorkouts.length === 1 ? 'y' : 'ies'} in this week?
                This can't be undone.
              </p>
              <div className="modal-actions">
                <div className="modal-actions__right">
                  <button type="button" className="btn btn--secondary" onClick={() => setConfirmingDelete(false)}>
                    Cancel
                  </button>
                  <button type="button" className="btn btn--danger" onClick={confirmDeleteWeek}>
                    Delete Week
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
